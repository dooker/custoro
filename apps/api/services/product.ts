import { postGeneralSingle, putGeneralSingle } from "./_helpers";
import { query } from "../helper/query";
import { RowDataPacket } from "mysql2";
import { invalidInputMessage, parseInput } from "../helpers/bodyInput";
import { productInput } from "../helpers/resourceInput";
import type { ProductIF } from "../types/product";
import type { QueryResult } from "../types/query";
import type { Request } from "express";

const type = "product";

// MySQL error codes for a second product with the same code (unique key on products.code) and for
// deleting a product that worksheets still point at (foreign key)
const duplicateEntry = "ER_DUP_ENTRY";
const rowIsReferenced = "ER_ROW_IS_REFERENCED_2";

const withProductMessage = <T extends { success: boolean; message?: string; code?: string }>(
    result: T
) =>
    !result.success && result.code === duplicateEntry
        ? { success: false, message: "product.exists" }
        : result;

export const getSingle = async (request: Request, id?: string): Promise<QueryResult<ProductIF>> => {
    const {
        database,
        params: { id: paramId }
    } = request;

    const { success, data } = await query<ProductIF>({
        database,
        sql: `SELECT id,
                     code,
                     name,
                     price,
                     discount_price AS discountPrice,
                     unit,
                     comment
              FROM products
              WHERE id = ?;`,
        params: [id || (paramId as string)],
        logger: `Get single ${type}`
    });

    if (!success) {
        return {
            success: false,
            message: "get.product"
        };
    }

    return {
        success: true,
        data
    };
};

export const getByCode = async (request: Request) => {
    const {
        query: { code },
        database
    } = request;

    // ?code[]=a gives a list, which is not a code
    if (typeof code !== "string") {
        return {
            success: false,
            message: invalidInputMessage
        };
    }

    const { success, data } = await query<ProductIF>({
        database,
        sql: `SELECT COUNT(id) AS count
              FROM products
              WHERE code = ?;`,
        params: [code],
        logger: `Get single ${type} by code`
    });

    if (!success) {
        return {
            success: false,
            message: "get.product.code"
        };
    }

    return {
        success: true,
        data: data?.[0].count
    };
};

export const postSingle = async (request: Request) => {
    const { body, database } = request;
    const input = parseInput(body, productInput);

    if (!input.ok) {
        return { success: false, message: input.message };
    }

    const { code, name, price, discountPrice, unit, comment } = input.values;
    const sql = `
        INSERT INTO products
        SET code           = ?,
            name           = ?,
            price          = ?,
            discount_price = ?,
            unit           = ?,
            comment        = ?;`;
    return withProductMessage(
        await postGeneralSingle({
            sql,
            params: [code, name, price, discountPrice, unit, comment],
            logger: type,
            database
        })
    );
};

export const putSingle = async (request: Request) => {
    const {
        database,
        params: { id },
        body
    } = request;
    const input = parseInput(body, productInput);

    if (!input.ok) {
        return { success: false, message: input.message };
    }

    const { code, name, price, discountPrice, unit, comment } = input.values;
    const sql = `
        UPDATE products
        SET code           = ?,
            name           = ?,
            price          = ?,
            discount_price = ?,
            unit           = ?,
            comment        = ?
        WHERE id = ?`;
    const params = [code, name, price, discountPrice, unit, comment, Number(id)];

    return withProductMessage(await putGeneralSingle({ database, sql, params, logger: type }));
};

export const deleteSingle = async (request: Request) => {
    const {
        params: { id },
        database
    } = request;

    const { success, code } = await query<RowDataPacket>({
        database,
        sql: `DELETE
              FROM products
              WHERE id = ?`,
        params: [id as string],
        logger: `Delete single ${type}`
    });

    if (!success) {
        return {
            success: false,
            message: code === rowIsReferenced ? "product.inUse" : "delete.product"
        };
    }

    return {
        success: true
    };
};
