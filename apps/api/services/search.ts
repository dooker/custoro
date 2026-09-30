import {
    getCustomers,
    getFromTo,
    getInvoices,
    getProducts,
    getUsers,
    getWorksheets
} from "../routes/_getters";
import { getTotal } from "../helper";
import { adjustProduct } from "./_helpers";
import { query } from "../helper/query";
import type { ProductIF } from "../types/product";
import type { Request } from "express";

export const getMultiple = async (request: Request) => {
    const {
        query: { resource, keyword, page, customer, limit },
        database
    } = request;
    let sql;

    const searchHandlers = {
        customers: getCustomers,
        products: getProducts,
        worksheets: getWorksheets,
        invoices: getInvoices,
        users: getUsers
    } as const;

    const handler = searchHandlers[resource as keyof typeof searchHandlers];

    if (!handler) {
        console.error(`Unknown resource ${resource} for search`);
    }

    const result = handler({
        keyword: String(keyword),
        customerId: Number(customer)
    });

    sql = result.sql;
    const totalSql = result.totalSql;
    const params = result.params;

    if (!sql) {
        return {
            success: false,
            message: "missing.sql"
        };
    }

    const { success: totalSuccess, data: totalData } = await query<{ total: number }>({
        database,
        sql: String(totalSql),
        params,
        logger: `Get multiple ${resource}`
    });

    if (!totalSuccess) {
        return {
            success: false,
            message: "get.items"
        };
    }

    const total = getTotal(Number(limit), totalData?.[0].total || 0);
    const totalVsPage = total < Number(page);

    sql = getFromTo(sql, Number(totalVsPage ? total : page), Number(limit));

    const { success, data } = await query({
        database,
        sql,
        params,
        logger: `Get multiple ${resource}`
    });

    switch (resource) {
        case "products":
            if (Array.isArray(data)) {
                data.forEach((element, index) => {
                    data[index] = adjustProduct(element as ProductIF);
                });
            }

            break;
        default:
            break;
    }

    return {
        success,
        resource: data,
        ...(total
            ? {
                  meta: {
                      page: totalVsPage ? total : page,
                      total,
                      ...(totalVsPage ? { redirect: true } : {})
                  }
              }
            : "")
    };
};
