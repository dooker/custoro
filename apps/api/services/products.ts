import { getFromTo, getProducts } from "../routes/_getters";
import { getGeneralMultiple } from "./_helpers";
import type { Request } from "express";

export const getMultiple = async (request: Request) => {
    const {
        query: { page, order, direction, limit }
    } = request;
    const { totalSql, params, sql } = getProducts({
        order: String(order),
        direction: String(direction)
    });

    return await getGeneralMultiple({
        request,
        sql: getFromTo(sql, page, limit),
        params,
        totalSql,
        type: "products"
    });
};
