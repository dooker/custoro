import { getWorksheets, getFromTo } from "../routes/_getters";
import { getGeneralMultiple } from "./_helpers";
import type { Request } from "express";

export const getMultiple = async (request: Request) => {
    const {
        query: { page, limit, customer }
    } = request;
    const { sql, totalSql, params } = getWorksheets({
        customerId: customer ? Number(customer) : null
    });

    return await getGeneralMultiple({
        request,
        sql: getFromTo(sql, Number(page), Number(limit)),
        params,
        totalSql,
        type: "worksheets"
    });
};
