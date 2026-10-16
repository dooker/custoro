import {
    applyPaging,
    getCustomers,
    getPaging,
    getInvoices,
    getProducts,
    getUsers,
    getWorksheets
} from "../routes/_getters";
import { getTotal } from "../helper";
import { adjustProduct } from "./_helpers";
import { isAdmin } from "../helpers/authorize";
import { query } from "../helper/query";
import type { ProductIF } from "../types/product";
import type { GetterIF } from "../types/getter";
import type { Request } from "express";

type Getter = (getter: GetterIF) => {
    sql: string;
    totalSql: string;
    params: (string | number | boolean)[];
};

export const getMultiple = async (request: Request) => {
    const {
        query: { resource, keyword, page, customer, limit },
        database
    } = request;
    let sql;

    // The user list is admin-only (GET /users), so searching it is too. The map only holds what
    // the caller may search, so another resource name can never reach a getter by accident.
    const searchHandlers = {
        customers: getCustomers,
        products: getProducts,
        worksheets: getWorksheets,
        invoices: getInvoices,
        ...(isAdmin(request) ? { users: getUsers } : {})
    } as Record<string, Getter>;

    const handler =
        typeof resource === "string" && Object.hasOwn(searchHandlers, resource)
            ? searchHandlers[resource]
            : undefined;

    if (!handler) {
        console.error(`Unknown resource ${resource} for search`);

        return {
            success: false,
            message: resource === "users" ? "forbidden" : "unknown.resource"
        };
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

    const { page: currentPage, limit: pageSize } = getPaging(page, limit);
    const total = getTotal(pageSize, totalData?.[0].total || 0);
    const totalVsPage = total < currentPage;

    sql = applyPaging(sql, {
        page: Math.max(totalVsPage ? total : currentPage, 1),
        limit: pageSize
    });

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
                      page: totalVsPage ? total : currentPage,
                      total,
                      ...(totalVsPage ? { redirect: true } : {})
                  }
              }
            : "")
    };
};
