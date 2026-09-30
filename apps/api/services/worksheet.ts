import { query } from "../helper/query";
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
        sql: `SELECT *
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
    const { body: params, database } = request;

    const { success, insertId } = await query({
        database,
        sql: `INSERT INTO worksheets
              SET customer_id = ?,
                  product_id  = ?,
                  order_id    = ?,
                  quantity    = ?;`,
        params: [
            params.customer ?? null,
            params.product_id ?? null,
            params.order_id ?? 0,
            params.quantity ?? 0
        ],
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
    const { body: params, database } = request;

    const { success } = await query({
        database,
        sql: `UPDATE worksheets
              SET customer_id = ?,
                  product_id  = ?,
                  order_id    = ?,
                  quantity    = ?
              WHERE id = ?;`,
        params: [
            params.customer_id ?? null,
            params.product_id ?? null,
            params.order_id ?? 0,
            params.quantity ?? 0,
            params.id
        ],
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

    const { success: successDeletedWorksheets } = await query({
        database,
        sql: `DELETE
              FROM worksheets
              WHERE id = ?;`,
        params: [id as string],
        logger: `Delete single ${type}`
    });

    if (!successDeletedWorksheets) {
        return {
            success: false,
            message: "delete.worksheet"
        };
    }

    const { success: successDeletedInvoiceItems } = await query({
        database,
        sql: ` DELETE
               FROM invoice_items
               WHERE worksheet_id = ?;`,
        params: [id as string],
        logger: "Delete single invoice items"
    });

    if (!successDeletedInvoiceItems) {
        return {
            success: false,
            message: "delete.worksheet.items"
        };
    }

    return {
        success: true
    };
};
