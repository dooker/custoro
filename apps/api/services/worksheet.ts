import { query } from "../helper/query";
import { TransactionRefusal, withTransaction } from "../helper/transaction";
import { parseInput } from "../helpers/bodyInput";
import { newWorksheetInput, worksheetInput } from "../helpers/resourceInput";
import type { RowDataPacket } from "mysql2/promise";
import type { ProductIF } from "../types/product";
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
              WHERE id = ?;`,
        params: [id as string],
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
        sql: `INSERT INTO worksheets
              SET customer_id = ?,
                  product_id  = ?,
                  order_id    = ?,
                  quantity    = ?;`,
        params: [customer, productId, orderId, quantity],
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
    const { success } = await query({
        database,
        sql: `UPDATE worksheets
              SET customer_id = ?,
                  product_id  = ?,
                  order_id    = ?,
                  quantity    = ?
              WHERE id = ?;`,
        params: [customerId, productId, orderId, quantity, Number(id)],
        logger: `Update single ${type}`
    });

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

    const deleted = await withTransaction(
        database,
        "Delete worksheet",
        "delete.worksheet",
        async (connection) => {
            const [worksheets] = await connection.query<RowDataPacket[]>(
                `SELECT locked
                 FROM worksheets
                 WHERE id = ?
                   FOR UPDATE;`,
                [id]
            );

            if (!worksheets.length) {
                return;
            }

            const [lines] = await connection.query<RowDataPacket[]>(
                `SELECT invoices.locked
                 FROM invoice_items
                          INNER JOIN invoices ON invoices.id = invoice_items.invoice_id
                 WHERE invoice_items.worksheet_id = ?
                   FOR UPDATE;`,
                [id]
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
                 WHERE worksheet_id = ?;`,
                [id]
            );

            await connection.query(
                `DELETE
                 FROM worksheets
                 WHERE id = ?;`,
                [id]
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
