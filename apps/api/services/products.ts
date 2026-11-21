import { getProducts, keywordOf } from "../routes/_getters";
import { getGeneralMultiple } from "./_helpers";
import { tenantOf } from "../helpers/tenant";
import type { Request } from "express";

export const getMultiple = async (request: Request) => {
    const {
        query: { order, direction, keyword }
    } = request;
    const { totalSql, params, sql } = getProducts({
        tenantId: tenantOf(request),
        keyword: keywordOf(keyword),
        order: String(order),
        direction: String(direction)
    });

    return await getGeneralMultiple({
        request,
        sql,
        params,
        totalSql,
        type: "products"
    });
};
