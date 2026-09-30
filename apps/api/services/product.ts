import { postGeneralSingle, putGeneralSingle } from "./_helpers";
import { query } from "../helper/query";
import { RowDataPacket } from "mysql2";
import type { PostPutPriceIF, ProductIF } from "../types/product";
import type { QueryResult } from "../types/query";
import type { Request } from "express";

const type = "product";

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

    const { success, data } = await query<ProductIF>({
        database,
        sql: `SELECT COUNT(id) AS count
              FROM products
              WHERE code = ?;`,
        params: [code as string],
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

const postPutPrice = ({ price, discountPrice }: PostPutPriceIF) => {
    const currentPrice = price ? parseFloat(price.toString().replace(",", ".")) : 0;
    const currentDiscountPrice = discountPrice
        ? parseFloat(discountPrice.toString().replace(",", "."))
        : 0;

    return {
        currentPrice,
        currentDiscountPrice
    };
};

export const postSingle = async (request: Request) => {
    const {
        body: { code, name, price, discountPrice, unit, comment },
        database
    } = request;

    const sql = `
        INSERT INTO products
        SET code           = ?,
            name           = ?,
            price          = ?,
            discount_price = ?,
            unit           = ?,
            comment        = ?;`;
    return await postGeneralSingle({
        sql,
        params: [code, name, price, discountPrice, unit, comment],
        logger: type,
        database
    });
};

export const putSingle = async (request: Request) => {
    const {
        database,
        params: { id },
        body: { code, name, price, discountPrice, unit, comment }
    } = request;

    const sql = `
        UPDATE products
        SET code           = ?,
            name           = ?,
            price          = ?,
            discount_price = ?,
            unit           = ?,
            comment        = ?
        WHERE id = ?`;
    const { currentPrice, currentDiscountPrice } = postPutPrice({ price, discountPrice });
    const params = [code, name, currentPrice, currentDiscountPrice, unit, comment, Number(id)];

    return await putGeneralSingle({ database, sql, params, logger: type });
};

export const deleteSingle = async (request: Request) => {
    const {
        params: { id },
        database
    } = request;

    const { success } = await query<RowDataPacket>({
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
            message: "delete.product"
        };
    }

    return {
        success: true
    };
};
