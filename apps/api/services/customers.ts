import { getFromTo, getCustomers, keywordOf } from "../routes/_getters";
import { getGeneralMultiple } from "./_helpers";
import { tenantOf } from "../helpers/tenant";
import type { Request } from "express";

export const getMultiple = async (request: Request) => {
    const {
        query: { page, order, direction, limit, keyword }
    } = request;
    const { sql, totalSql, params } = getCustomers({
        tenantId: tenantOf(request),
        keyword: keywordOf(keyword),
        order: String(order),
        direction: String(direction)
    });

    return await getGeneralMultiple({
        request,
        sql: getFromTo(sql, page, limit),
        params,
        totalSql,
        type: "customers"
    });
};
