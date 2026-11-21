import { getWorksheets, keywordOf } from "../routes/_getters";
import { getGeneralMultiple } from "./_helpers";
import { tenantOf } from "../helpers/tenant";
import type { Request } from "express";

export const getMultiple = async (request: Request) => {
    const {
        query: { customer, keyword }
    } = request;
    const { sql, totalSql, params } = getWorksheets({
        tenantId: tenantOf(request),
        keyword: keywordOf(keyword),
        customerId: customer ? Number(customer) : null
    });

    return await getGeneralMultiple({
        request,
        sql,
        params,
        totalSql,
        type: "worksheets"
    });
};
