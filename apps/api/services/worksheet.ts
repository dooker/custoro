import { query } from "../helper/query";
import { TransactionRefusal, withTransaction } from "../helper/transaction";
import { parseInput } from "../helpers/bodyInput";
import { newWorksheetInput, worksheetInput } from "../helpers/resourceInput";
import type { RowDataPacket } from "mysql2/promise";
import type { ProductIF } from "../types/product";
import { tenantOf } from "../helpers/tenant";
import type { Request } from "express";

const type = "worksheet";

export const getSingle = async (request: Request) => {
    const {
        params: { id },
        database
    } = request;

    const { success, data } = await query<ProductIF>({
        database,
        sql: `SELECT id,
                     product_id,
                     customer_id,
                     order_id,
                     quantity,
                     invoice,
                     locked
              FROM worksheets
              WHERE tenant_id = ?
                AND id = ?;`,
        params: [tenantOf(request), id as string],
        logger: `Get single ${type}`
    });

    if (!success) {
        return {
            success: false,
            message: "get.worksheet"
        };
    }

    return {
        success: true,
        data
    };
};

export const postSingle = async (request: Request) => {
    const { body, database } = request;
    const input = parseInput(body, newWorksheetInput);

    if (!input.ok) {
        return { success: false, message: input.message };
    }

    const { customer, product_id: productId, order_id: orderId, quantity } = input.values;

    const { success, insertId } = await query({
        database,
        // The customer and the product must be the company's own: the foreign keys include
        // tenant_id, so another company's ids are refused
        sql: `INSERT INTO worksheets
              SET tenant_id   = ?,
                  customer_id = ?,
                  product_id  = ?,
                  order_id    = ?,
                  quantity    = ?;`,
        params: [tenantOf(request), customer, productId, orderId, quantity],
        logger: `Add new ${type}`
    });

    if (!success || !insertId) {
        return {
            success: false,
            message: "put.worksheet"
        };
    }

    return {
        success,
        insertId: insertId
    };
};

export const putSingle = async (request: Request) => {
    const {
        body,
        params: { id },
        database
    } = request;
    const input = parseInput(body, worksheetInput);

    if (!input.ok) {
        return { success: false, message: input.message };
    }

    const {
        customer_id: customerId,
        product_id: productId,
        order_id: orderId,
        quantity
    } = input.values;

    // The worksheet is the one in the URL, not whatever id the body says
    const { success, affectedRows } = await query({
        database,
        sql: `UPDATE worksheets
              SET customer_id = ?,
                  product_id  = ?,
                  order_id    = ?,
                  quantity    = ?
              WHERE tenant_id = ?
                AND id = ?;`,
        params: [customerId, productId, orderId, quantity, tenantOf(request), Number(id)],
        logger: `Update single ${type}`
    });

    // No worksheet of the caller's company has that id
    if (success && affectedRows === 0) {
        return {
            success: false,
            message: "notFound"
        };
    }

    if (!success) {
        return {
            success: false,
            message: "put.worksheet"
        };
    }

    return {
        success: true
    };
};

export const deleteSingle = async (request: Request) => {
    const {
        params: { id },
        database
    } = request;
    const tenantId = tenantOf(request);

    const deleted = await withTransaction(
        database,
        "Delete worksheet",
        "delete.worksheet",
        async (connection) => {
            const [worksheets] = await connection.query<RowDataPacket[]>(
                `SELECT locked
                 FROM worksheets
                 WHERE tenant_id = ?
                   AND id = ?
                   FOR UPDATE;`,
                [tenantId, id]
            );

            // None of the caller's company has that id: the same answer as one that never existed
            if (!worksheets.length) {
                throw new TransactionRefusal("notFound");
            }

            const [lines] = await connection.query<RowDataPacket[]>(
                `SELECT invoices.locked
                 FROM invoice_items
                          INNER JOIN invoices ON invoices.id = invoice_items.invoice_id
                 WHERE invoice_items.tenant_id = ?
                   AND invoice_items.worksheet_id = ?
                   FOR UPDATE;`,
                [tenantId, id]
            );

            // A paid worksheet, or one whose line is on a locked invoice, is part of an issued
            // invoice: deleting it would delete a line from that invoice
            if (worksheets[0].locked === "1" || lines.some((line) => Number(line.locked) === 1)) {
                throw new TransactionRefusal("worksheet.locked");
            }

            // Lines on invoices that are still open go with the worksheet (the foreign key
            // would refuse to delete a worksheet that has lines)
            await connection.query(
                `DELETE
                 FROM invoice_items
                 WHERE tenant_id = ?
                   AND worksheet_id = ?;`,
                [tenantId, id]
            );

            await connection.query(
                `DELETE
                 FROM worksheets
                 WHERE tenant_id = ?
                   AND id = ?;`,
                [tenantId, id]
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
