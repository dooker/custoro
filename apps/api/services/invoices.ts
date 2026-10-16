import { getFromTo, getInvoices } from "../routes/_getters";
import { getGeneralMultiple } from "./_helpers";
import type { Request } from "express";

export const getMultiple = async (request: Request) => {
    const {
        query: { page, limit, customer }
    } = request;
    const { sql, totalSql, params } = getInvoices({
        customerId: customer ? Number(customer) : null
    });

    return await getGeneralMultiple({
        request,
        sql: getFromTo(sql, page, limit),
        params,
        totalSql,
        type: "invoices"
    });
};
