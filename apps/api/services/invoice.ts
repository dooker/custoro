import { query } from "../helper/query";
import { createInvoiceWithNextNumber } from "../helper/invoiceNumber";
import { getInvoice } from "./_helpers";
import { getSingle as getSingleProduct } from "./product";
import { getSingle as getSingleCustomer } from "./customer";
import type { ProductIF } from "../types/product";
import type { Request } from "express";
import type { GetProductsMapIF } from "../types/invoice";

export const getLast = async (request: Request) => {
    const { database } = request;

    const { success, data } = await query<{ lastId: number }>({
        database,
        sql: `SELECT value AS lastId
              FROM config
              WHERE name = 'lastInvoiceId';`,
        params: [],
        logger: "Get last invoice ID"
    });

    if (!success) {
        return {
            success: false,
            message: "get.lastInvoiceId"
        };
    }

    return {
        success: true,
        data: data?.[0].lastId || null
    };
};

export const getSingle = async (request: Request) => {
    const { success, message, data } = await getInvoice(request);
    const invoice = data?.[0];

    if (!success || !invoice) {
        return {
            success,
            message
        };
    }

    if (invoice.locked === 1) {
        const { success, data, message } = await getSingleCustomer(request, invoice.customerId);

        if (!success || !data) {
            return {
                success,
                message
            };
        }

        const customer = data[0];

        if (customer) {
            invoice.customerName = customer.name;
        }
    }

    return {
        success: true,
        data: [invoice]
    };
};

export const getMultiplePerCustomer = async (request: Request) => {
    const {
        params: { customer },
        database
    } = request;

    const { success, data } = await query({
        database,
        sql: `SELECT id, number
              FROM invoices
              WHERE invoices.customer_id = ?
                AND locked = '0'
              ORDER BY number + 0 DESC;`,
        params: [String(customer)],
        logger: "Get invoices for customer"
    });

    if (!success) {
        return {
            success: false,
            message: "get.invoices"
        };
    }

    return {
        success,
        data
    };
};

const getProductsMap = async ({ database, items }: GetProductsMapIF) => {
    const ids = items.map((i) => i.productId);

    if (ids.length === 0) {
        return new Map();
    }

    const placeholders = ids.map(() => "?").join(",");

    const { data } = await query<ProductIF>({
        database,
        sql: `
            SELECT id, code, name, price, discount_price AS discountPrice, unit, comment
            FROM products
            WHERE id IN (${placeholders});
        `,
        params: ids,
        logger: "Batch fetch products"
    });

    if (!data) {
        return new Map();
    }

    const map = new Map();
    for (const p of data) {
        map.set(p.id, p);
    }

    return map;
};

export const postSingle = async (request: Request) => {
    const {
        database,
        body: { customerId, items }
    } = request;

    const { success: vatSuccess, data: vatData } = await query<{ value: number }>({
        database,
        sql: `SELECT value
              FROM config
              WHERE name = 'vat';`,
        params: [],
        logger: "Get VAT"
    });
    const vat = vatData?.[0].value;

    if (!vatSuccess || !vat) {
        return {
            success: false,
            message: "get.vat"
        };
    }

    const invoice = await createInvoiceWithNextNumber({ database, customerId, vat });

    if (!invoice) {
        return {
            success: false,
            message: "post.newInvoice"
        };
    }

    const insertId = invoice.id;

    if (items) {
        const productMap = await getProductsMap({ database, items });

        for await (const item of items) {
            const { worksheetId, productId, quantity } = item;
            const product = productMap.get(productId);
            const { code, name, price, discountPrice, unit, comment } = product;

            const { success: insertNewWorksheetSuccess } = await query({
                database,
                sql: `INSERT INTO invoice_items
                      SET worksheet_id   = ?,
                          product_id     = ?,
                          invoice_id     = ?,
                          code           = ?,
                          name           = ?,
                          price          = ?,
                          discount_price = ?,
                          unit           = ?,
                          comment        = ?,
                          quantity       = ?;`,
                params: [
                    worksheetId,
                    productId,
                    insertId,
                    code,
                    name,
                    price,
                    discountPrice,
                    unit,
                    comment,
                    quantity
                ],
                logger: "Add new item to invoice"
            });

            if (!insertNewWorksheetSuccess) {
                return {
                    success: false,
                    message: "post.newWorkSheet"
                };
            }

            if (worksheetId) {
                const { success: updateWorksheetSuccess } = await query({
                    database,
                    sql: `UPDATE worksheets
                          SET invoice = ?
                          WHERE id = ?;`,
                    params: [insertId, worksheetId],
                    logger: "Set item as inactive on worksheet"
                });

                if (!updateWorksheetSuccess) {
                    return {
                        success: false,
                        message: "put.workSheet"
                    };
                }
            }
        }
    }

    return {
        success: true,
        lastId: insertId
    };
};

export const putSingle = async (request: Request) => {
    const {
        database,
        body: { items, invoiceId }
    } = request;
    const item = items[0];
    const { success, data } = await getSingleProduct(request, item.productId);

    if (!success || !data) {
        throw new Error("Product not found");
    }

    const product = data[0];
    const { worksheetId, productId, quantity } = item;
    const { code, name, price, discountPrice, unit, comment } = product;

    const { success: insertSuccess } = await query({
        database,
        sql: `INSERT INTO invoice_items
              SET product_id     = ?,
                  invoice_id     = ?,
                  worksheet_id   = ?,
                  quantity       = ?,
                  code           = ?,
                  name           = ?,
                  price          = ?,
                  discount_price = ?,
                  unit           = ?,
                  comment        = ?;`,
        params: [
            productId,
            invoiceId,
            worksheetId,
            quantity,
            code,
            name,
            price,
            discountPrice,
            unit,
            comment
        ],
        logger: "Add new item to invoice"
    });

    if (!insertSuccess) {
        return {
            success: false,
            message: "post.item.invoice"
        };
    }

    if (worksheetId) {
        const { success } = await query({
            database,
            sql: `UPDATE worksheets
                  SET invoice = ?
                  WHERE id = ?;`,
            params: [invoiceId, worksheetId],
            logger: "Set item as inactive on worksheet"
        });

        if (!success) {
            return {
                success: false,
                message: "put.worksheets"
            };
        }
    }

    const { success: updateSuccess } = await query({
        database,
        sql: `UPDATE invoices
              SET change_date = NOW()
              WHERE id = ?;`,
        params: [invoiceId],
        logger: "Update change date on invoice"
    });

    if (!updateSuccess) {
        return {
            success: false,
            message: "put.invoice"
        };
    }

    return {
        success: true
    };
};

// export const updateItems = async (items, invoiceId) => {
//     // TODO refactor all
//     try {
//         for await (const item of items) {
//             const { id, quantity } = item;
//
//             if (id) {
//                 await query({
//                     sql: `UPDATE invoice_items
//                           SET quantity = ?
//                           WHERE id = ?;`,
//                     params: [quantity || 0, id],
//                     logger: "Update item on invoice"
//                 });
//             } else {
//                 // TODO fetch all products that are in items
//                 // const { code, name, price, discountPrice, unit, comment } = (
//                 //     await product.getSingle({
//                 //         id: id
//                 //     })
//                 // ).resource;
//                 //
//                 // console.log(code, name, price, discountPrice, unit, comment);
//
//                 await query({
//                     sql: `INSERT INTO invoice_items
//                           SET worksheet_id   = ?,
//                               product_id     = ?,
//                               invoice_id     = ?,
//                               code           = ?,
//                               name           = ?,
//                               price          = ?,
//                               discount_price = ?,
//                               unit           = ?,
//                               comment        = ?,
//                               quantity       = ?;`,
//                     params: [quantity || 0, id],
//                     logger: "Update item on invoice"
//                 });
//             }
//             console.log(id, invoiceId);
//         }
//
//         return true;
//     } catch (error) {
//         console.log(error);
//         return false;
//     }
// };

export const putSingleData = async (request: Request) => {
    const {
        body: { invoiceDate, customerId, id, paymentType, invoiceType, number },
        database
    } = request;

    const { data: customer } = await getSingleCustomer(request, customerId);
    const { paymentPeriod } = customer?.[0] || {};

    const { success: updateInvoiceSuccess } = await query({
        database,
        sql: `UPDATE invoices
              SET invoice_date    = ?,
                  customer_id    = ?,
                  number         = ?,
                  payment_type   = ?,
                  invoice_type   = ?,
                  change_date     = NOW(),
                  payment_period = ?
              WHERE id = ?;`,
        params: [
            invoiceDate,
            customerId ?? null,
            number,
            paymentType,
            invoiceType,
            paymentPeriod,
            id
        ],
        logger: "Update invoice data"
    });

    if (!updateInvoiceSuccess) {
        return {
            success: false,
            message: "put.invoice"
        };
    }

    const { success: updateWorksheetsSuccess } = await query({
        database,
        sql: `UPDATE worksheets
              SET customer_id = ?
              WHERE invoice = ?
                AND customer_id <> ?;`,
        params: [customerId, id, customerId],
        logger: "Update worksheet customer"
    });

    if (!updateWorksheetsSuccess) {
        return {
            success: false,
            message: "put.worksheets"
        };
    }

    return {
        success: true
    };

    // TODO do we need t update items? this is purely invoice updating
    //
    //     // const itemsUpdated = await updateItems(items, id)
    //     //
    //     // if (itemsUpdated) {
    //     //     return {
    //     //         success: true
    //     //     }
    //     // } else {
    //     //     return {
    //     //         success: false,
    //     //         message: "Items update failed",
    //     //     }
    //     // }
};

export const putSingleItem = async (request: Request) => {
    const {
        body: { value },
        params: { id },
        database
    } = request;

    const params = [value || 0, id];

    const { success: updateInvoiceItemsSuccess } = await query({
        database,
        sql: `UPDATE invoice_items
              SET quantity = ?
              WHERE id = ?;`,
        params,
        logger: "Add new item to invoice"
    });

    if (!updateInvoiceItemsSuccess) {
        return {
            success: false,
            message: "put.invoice.items"
        };
    }

    const { success: updateInvoiceSuccess } = await query({
        database,
        sql: `UPDATE invoices
              SET change_date = NOW()
              WHERE id = ?;`,
        params,
        logger: "Update change date on invoice"
    });

    if (!updateInvoiceSuccess) {
        return {
            success: false,
            message: "put.invoice"
        };
    }

    return {
        success: true
    };
};

// delete invoice item
export const deleteSingleItem = async (request: Request) => {
    const {
        params: { invoiceId, id },
        database
    } = request;

    const { success: worksheetIdSuccess, data } = await query<{ worksheet_id: number }>({
        database,
        sql: `SELECT worksheet_id
              FROM invoice_items
              WHERE id = ?;`,
        params: [String(id)],
        logger: "Get worksheet ID from invoice item"
    });

    if (!worksheetIdSuccess) {
        return {
            success: false,
            message: "get.worksheet.id"
        };
    }

    const worksheetId = data?.[0].worksheet_id;

    if (worksheetId) {
        const { success } = await query({
            database,
            sql: `UPDATE worksheets
                  SET invoice = '0'
                  WHERE id = ?;`,
            params: [worksheetId],
            logger: "Delete single invoice [worksheet]"
        });

        if (!success) {
            return {
                success: false,
                message: "delete.worksheet"
            };
        }
    }

    const { success: invoiceItemSuccess } = await query({
        database,
        sql: `DELETE
              FROM invoice_items
              WHERE id = ?;`,
        params: [String(id)],
        logger: "Delete single invoice [invoice]"
    });

    if (!invoiceItemSuccess) {
        return {
            success: false,
            message: "delete.invoice.item"
        };
    }

    const { success: invoiceSuccess } = await query({
        database,
        sql: `UPDATE invoices
              SET change_date = NOW()
              WHERE id = ?;`,
        params: [String(invoiceId)],
        logger: "Update change date on invoice"
    });

    if (!invoiceSuccess) {
        return {
            success: false,
            message: "put.invoice"
        };
    }

    return {
        success: true
    };
};

export const markAsPaid = async (request: Request) => {
    const {
        params: { id },
        database
    } = request;

    if (!id) {
        return {
            success: false,
            message: "missing.id"
        };
    }

    const { success: invoiceSuccess } = await query({
        database,
        sql: `UPDATE invoices
              SET locked = '1'
              WHERE id = ?;`,
        params: [String(id)],
        logger: "Lock invoice"
    });

    if (!invoiceSuccess) {
        return {
            success: false,
            message: "put.invoice.lock"
        };
    }

    const { success: worksheetSuccess } = await query({
        database,
        sql: `UPDATE worksheets
              SET locked = '1'
              WHERE invoice = ?;`,
        params: [String(id)],
        logger: "Lock worksheets"
    });

    if (!worksheetSuccess) {
        return {
            success: false,
            message: "put.worksheet.lock"
        };
    }

    return {
        success: true
    };
};
