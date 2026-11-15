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
import { tenantOf } from "../helpers/tenant";
import type { Request } from "express";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

// A paid invoice is locked: its lines, quantities, number, date and customer stay as they were
// billed. Every change to an invoice starts here, inside its transaction, and the row lock keeps
// it from being marked as paid while the change is being saved. An invoice the caller's company
// does not have (one that never existed, or another company's) is refused as not found.
export const lockedInvoiceMessage = "invoice.locked";

const refuseLockedInvoice = async (
    connection: PoolConnection,
    tenantId: number,
    invoiceId: unknown
) => {
    const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT locked
         FROM invoices
         WHERE tenant_id = ?
           AND id = ?
             FOR UPDATE;`,
        [tenantId, invoiceId]
    );

    if (!Array.isArray(rows) || !rows.length) {
        throw new TransactionRefusal("notFound");
    }

    if (rows.some((row) => Number(row.locked) === 1)) {
        throw new TransactionRefusal(lockedInvoiceMessage);
    }
};

export const getLast = async (request: Request) => {
    const { database } = request;

    const { success, data } = await query<{ lastId: number }>({
        database,
        sql: `SELECT value AS lastId
              FROM config
              WHERE tenant_id = ?
                AND name = 'lastInvoiceId';`,
        params: [tenantOf(request)],
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

    // A paid invoice shows its customer as billed (the copy taken when it was marked as paid); an
    // open one follows its customer, whose name the web app takes from its list of customers
    invoice.customerName =
        Number(invoice.locked) === 1 ? (invoice.customerName ?? undefined) : undefined;

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
              WHERE invoices.tenant_id = ?
                AND invoices.customer_id = ?
                AND locked = '0'
              ORDER BY number + 0 DESC;`,
        params: [tenantOf(request), String(customer)],
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

// Only the company's own products: a line can never copy another company's product (the
// product reference of invoice_items is the one without tenant_id, see the schema)
const getProductsMap = async (database: string, tenantId: number, productIds: number[]) => {
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
            WHERE tenant_id = ?
              AND id IN (${placeholders});
        `,
        params: [tenantId, ...ids],
        logger: "Batch fetch products"
    });

    return new Map((data ?? []).map((product) => [Number(product.id), product]));
};

// What a request wants to add to an invoice: a product, a quantity and, when it comes from
// the worksheets, the worksheet. Returns the lines to store (each with its own copy of the
// product's data), or the key of the message to show when something does not add up.
export const buildInvoiceLines = async (
    database: string,
    tenantId: number,
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
        tenantId,
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
    const tenantId = tenantOf(request);
    const { success: vatSuccess, data: vatData } = await query<{ value: number }>({
        database,
        sql: `SELECT value
              FROM config
              WHERE tenant_id = ?
                AND name = 'vat';`,
        params: [tenantId],
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
    const built = await buildInvoiceLines(database, tenantId, body.items);

    if ("message" in built) {
        return {
            success: false,
            message: built.message
        };
    }

    // The customer must be the company's own: the foreign key includes tenant_id
    const created = await createInvoiceWithNextNumber({
        database,
        tenantId,
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
    const tenantId = tenantOf(request);
    // Only the first line is added, the web app sends one at a time
    const first = Array.isArray(body.items) ? body.items[0] : undefined;
    const built = await buildInvoiceLines(database, tenantId, first ? [first] : []);

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
            await refuseLockedInvoice(connection, tenantId, invoiceId);
            await addInvoiceLines(connection, tenantId, invoiceId, built.lines);
            await connection.query(
                `UPDATE invoices
                 SET change_date = NOW()
                 WHERE tenant_id = ?
                   AND id = ?;`,
                [tenantId, invoiceId]
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
    const tenantId = tenantOf(request);

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

    // The details and the worksheets that follow the customer are saved together
    const saved = await withTransaction(
        database,
        "Update invoice data",
        "put.invoice",
        async (connection) => {
            await refuseLockedInvoice(connection, tenantId, id);
            await connection.query(
                `UPDATE invoices
                 SET invoice_date   = ?,
                     customer_id    = ?,
                     number         = ?,
                     payment_type   = ?,
                     invoice_type   = ?,
                     change_date    = NOW(),
                     payment_period = COALESCE(?, payment_period)
                 WHERE tenant_id = ?
                   AND id = ?;`,
                [
                    invoiceDate,
                    customerId,
                    number,
                    paymentType,
                    invoiceType,
                    paymentPeriod,
                    tenantId,
                    id
                ]
            );

            // Worksheets on the invoice follow its customer
            if (customerId) {
                await connection.query(
                    `UPDATE worksheets
                     SET customer_id = ?
                     WHERE tenant_id = ?
                       AND invoice = ?
                       AND customer_id <> ?;`,
                    [customerId, tenantId, id, customerId]
                );
            }
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
    const tenantId = tenantOf(request);

    // The quantity and the invoice's change date are saved together. The item must belong to
    // the invoice in the URL, and it is that invoice whose change date is set.
    const saved = await withTransaction(
        database,
        "Update invoice item quantity",
        "put.invoice.items",
        async (connection) => {
            await refuseLockedInvoice(connection, tenantId, invoiceId);

            const [updated] = await connection.query<ResultSetHeader>(
                `UPDATE invoice_items
                 SET quantity = ?
                 WHERE tenant_id = ?
                   AND id = ?
                   AND invoice_id = ?;`,
                [value, tenantId, id, invoiceId]
            );

            if (!updated.affectedRows) {
                throw new TransactionRefusal("put.invoice.items");
            }

            await connection.query(
                `UPDATE invoices
                 SET change_date = NOW()
                 WHERE tenant_id = ?
                   AND id = ?;`,
                [tenantId, invoiceId]
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
    const tenantId = tenantOf(request);

    // The line goes, its worksheet becomes open again and the invoice's change date is set, or
    // none of it happens
    const deleted = await withTransaction(
        database,
        "Delete invoice item",
        "delete.invoice.item",
        async (connection) => {
            await refuseLockedInvoice(connection, tenantId, invoiceId);

            const [rows] = await connection.query<RowDataPacket[]>(
                `SELECT worksheet_id
                 FROM invoice_items
                 WHERE tenant_id = ?
                   AND id = ?
                   AND invoice_id = ?
                     FOR UPDATE;`,
                [tenantId, id, invoiceId]
            );

            if (!rows.length) {
                throw new TransactionRefusal("delete.invoice.item");
            }

            await connection.query(
                `DELETE
                 FROM invoice_items
                 WHERE tenant_id = ?
                   AND id = ?;`,
                [tenantId, id]
            );

            if (rows[0].worksheet_id) {
                await connection.query(
                    `UPDATE worksheets
                     SET invoice = NULL
                     WHERE tenant_id = ?
                       AND id = ?
                       AND invoice = ?;`,
                    [tenantId, rows[0].worksheet_id, invoiceId]
                );
            }

            await connection.query(
                `UPDATE invoices
                 SET change_date = NOW()
                 WHERE tenant_id = ?
                   AND id = ?;`,
                [tenantId, invoiceId]
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

// The copy of the customer a paid invoice keeps: the columns of invoices and where they come from
const customerCopy = [
    ["customer_name", "name"],
    ["customer_reg_number", "reg_number"],
    ["customer_vat_number", "vat_number"],
    ["customer_address", "address"],
    ["customer_phone", "phone"],
    ["customer_email", "email"],
    ["customer_department", "department"],
    ["customer_payment_period", "payment_period"]
] as const;

// Locks the invoice and its worksheets, and copies its customer's details into it, so a later
// change to the customer does not change what this invoice says. Marking a paid invoice as paid
// again changes nothing: it keeps the copy it was billed with.
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

    const tenantId = tenantOf(request);
    const locked = await withTransaction(
        database,
        "Lock invoice",
        "put.invoice.lock",
        async (connection) => {
            const [rows] = await connection.query<RowDataPacket[]>(
                `SELECT locked
                 FROM invoices
                 WHERE tenant_id = ?
                   AND id = ?
                     FOR UPDATE;`,
                [tenantId, String(id)]
            );

            if (!rows.length) {
                throw new TransactionRefusal("notFound");
            }

            if (Number(rows[0].locked) === 1) {
                return;
            }

            await connection.query(
                `UPDATE invoices
                     LEFT JOIN customers ON customers.tenant_id = invoices.tenant_id
                         AND customers.id = invoices.customer_id
                 SET invoices.locked = 1,
                     ${customerCopy.map(([column, source]) => `invoices.${column} = customers.${source}`).join(",\n                     ")}
                 WHERE invoices.tenant_id = ?
                   AND invoices.id = ?;`,
                [tenantId, String(id)]
            );
            await connection.query(
                `UPDATE worksheets
                 SET locked = '1'
                 WHERE tenant_id = ?
                   AND invoice = ?;`,
                [tenantId, String(id)]
            );
        }
    );

    if (!locked.ok) {
        return {
            success: false,
            message: locked.message
        };
    }

    return {
        success: true
    };
};
