import { query } from "../helper/query";
import { createInvoiceWithNextNumber } from "../helper/invoiceNumber";
import { addInvoiceLines, type InvoiceLineIF } from "../helper/invoiceLines";
import { TransactionRefusal, withTransaction } from "../helper/transaction";
import { getInvoice } from "./_helpers";
import { getSingle as getSingleCustomer } from "./customer";
import { parseInput } from "../helpers/bodyInput";
import {
    addLineInput,
    invoiceDataInput,
    lineInput,
    maxInvoiceLines,
    newInvoiceInput,
    quantityInput
} from "../helpers/resourceInput";
import type { ProductIF } from "../types/product";
import type { Request } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

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
        data: data?.[0]?.lastId || null
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

const getProductsMap = async (database: string, productIds: number[]) => {
    const ids = [...new Set(productIds)];

    if (ids.length === 0) {
        return new Map<number, ProductIF>();
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

    return new Map((data ?? []).map((product) => [Number(product.id), product]));
};

// What a request wants to add to an invoice: a product, a quantity and, when it comes from
// the worksheets, the worksheet. Returns the lines to store (each with its own copy of the
// product's data), or the key of the message to show when something does not add up.
export const buildInvoiceLines = async (
    database: string,
    items: unknown
): Promise<{ lines: InvoiceLineIF[] } | { message: string }> => {
    if (items === undefined || items === null) {
        return { lines: [] };
    }

    if (!Array.isArray(items) || items.length > maxInvoiceLines) {
        return { message: "post.newWorkSheet" };
    }

    const requested = [];

    for (const item of items) {
        const input = parseInput(item, lineInput);

        if (!input.ok) {
            return { message: "post.newWorkSheet" };
        }

        requested.push(input.values);
    }

    const products = await getProductsMap(
        database,
        requested.map((item) => item.productId)
    );
    const lines: InvoiceLineIF[] = [];

    for (const { productId, quantity, worksheetId } of requested) {
        const product = products.get(productId);

        if (!product) {
            return { message: "get.product" };
        }

        lines.push({
            worksheetId: worksheetId || null,
            productId: product.id,
            quantity,
            code: product.code,
            name: product.name,
            price: product.price,
            discountPrice: product.discountPrice,
            unit: product.unit,
            comment: product.comment
        });
    }

    return { lines };
};

export const postSingle = async (request: Request) => {
    const { database, body } = request;
    const input = parseInput(body, newInvoiceInput);

    if (!input.ok) {
        return { success: false, message: input.message };
    }

    const { customerId } = input.values;
    const { success: vatSuccess, data: vatData } = await query<{ value: number }>({
        database,
        sql: `SELECT value
              FROM config
              WHERE name = 'vat';`,
        params: [],
        logger: "Get VAT"
    });
    const vat = vatData?.[0]?.value;

    if (!vatSuccess || !vat) {
        return {
            success: false,
            message: "get.vat"
        };
    }

    // Everything that can be checked is checked before the number is taken
    const built = await buildInvoiceLines(database, body.items);

    if ("message" in built) {
        return {
            success: false,
            message: built.message
        };
    }

    const created = await createInvoiceWithNextNumber({
        database,
        customerId,
        vat,
        lines: built.lines
    });

    if (!created.ok) {
        return {
            success: false,
            message: created.message
        };
    }

    return {
        success: true,
        lastId: created.value.id
    };
};

export const putSingle = async (request: Request) => {
    const { database, body } = request;
    const input = parseInput(body, addLineInput);

    if (!input.ok) {
        return { success: false, message: input.message };
    }

    const { invoiceId } = input.values;
    // Only the first line is added, the web app sends one at a time
    const first = Array.isArray(body.items) ? body.items[0] : undefined;
    const built = await buildInvoiceLines(database, first ? [first] : []);

    if ("message" in built || !built.lines.length) {
        return {
            success: false,
            message: "message" in built ? built.message : "post.item.invoice"
        };
    }

    // The line, the billed worksheet and the invoice's change date are saved together
    const saved = await withTransaction(
        database,
        "Add item to invoice",
        "post.item.invoice",
        async (connection) => {
            await addInvoiceLines(connection, invoiceId, built.lines);
            await connection.query(
                `UPDATE invoices
                 SET change_date = NOW()
                 WHERE id = ?;`,
                [invoiceId]
            );
        }
    );

    if (!saved.ok) {
        return {
            success: false,
            message: saved.message
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
    const { body, database } = request;
    const input = parseInput(body, invoiceDataInput);

    if (!input.ok) {
        return { success: false, message: input.message };
    }

    const { id, customerId, invoiceDate, paymentType, invoiceType, number } = input.values;

    // An invoice takes its payment period from its customer; it keeps its own when it has no
    // customer, or when the customer has no period. A customer that cannot be read is an error:
    // the invoice would be saved for the new customer with the old customer's terms.
    let paymentPeriod: number | null = null;

    if (customerId) {
        const { success: customerSuccess, data: customer } = await getSingleCustomer(
            request,
            customerId
        );

        if (!customerSuccess || !customer?.[0]) {
            return {
                success: false,
                message: "get.customer"
            };
        }

        paymentPeriod = customer[0].paymentPeriod ?? null;
    }

    const { success: updateInvoiceSuccess } = await query({
        database,
        sql: `UPDATE invoices
              SET invoice_date    = ?,
                  customer_id    = ?,
                  number         = ?,
                  payment_type   = ?,
                  invoice_type   = ?,
                  change_date     = NOW(),
                  payment_period = COALESCE(?, payment_period)
              WHERE id = ?;`,
        params: [invoiceDate, customerId, number, paymentType, invoiceType, paymentPeriod, id],
        logger: "Update invoice data"
    });

    if (!updateInvoiceSuccess) {
        return {
            success: false,
            message: "put.invoice"
        };
    }

    // Worksheets on the invoice follow its customer
    if (customerId) {
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
        body,
        params: { invoiceId, id },
        database
    } = request;
    const input = parseInput(body, quantityInput);

    if (!input.ok) {
        return { success: false, message: input.message };
    }

    const { value } = input.values;

    // The quantity and the invoice's change date are saved together. The item must belong to
    // the invoice in the URL, and it is that invoice whose change date is set.
    const saved = await withTransaction(
        database,
        "Update invoice item quantity",
        "put.invoice.items",
        async (connection) => {
            const [updated] = await connection.query<ResultSetHeader>(
                `UPDATE invoice_items
                 SET quantity = ?
                 WHERE id = ?
                   AND invoice_id = ?;`,
                [value, id, invoiceId]
            );

            if (!updated.affectedRows) {
                throw new TransactionRefusal("put.invoice.items");
            }

            await connection.query(
                `UPDATE invoices
                 SET change_date = NOW()
                 WHERE id = ?;`,
                [invoiceId]
            );
        }
    );

    if (!saved.ok) {
        return {
            success: false,
            message: saved.message
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

    // The line goes, its worksheet becomes open again and the invoice's change date is set, or
    // none of it happens
    const deleted = await withTransaction(
        database,
        "Delete invoice item",
        "delete.invoice.item",
        async (connection) => {
            const [rows] = await connection.query<RowDataPacket[]>(
                `SELECT worksheet_id
                 FROM invoice_items
                 WHERE id = ?
                   AND invoice_id = ?
                     FOR UPDATE;`,
                [id, invoiceId]
            );

            if (!rows.length) {
                throw new TransactionRefusal("delete.invoice.item");
            }

            await connection.query(
                `DELETE
                 FROM invoice_items
                 WHERE id = ?;`,
                [id]
            );

            if (rows[0].worksheet_id) {
                await connection.query(
                    `UPDATE worksheets
                     SET invoice = NULL
                     WHERE id = ?
                       AND invoice = ?;`,
                    [rows[0].worksheet_id, invoiceId]
                );
            }

            await connection.query(
                `UPDATE invoices
                 SET change_date = NOW()
                 WHERE id = ?;`,
                [invoiceId]
            );
        }
    );

    if (!deleted.ok) {
        return {
            success: false,
            message: deleted.message
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
