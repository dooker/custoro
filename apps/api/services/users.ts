import { getUsers, getFromTo } from "../routes/_getters";
import { currentRoute } from "../routes/users";
import { getGeneralMultiple } from "./_helpers";
import type { Request } from "express";

export const getMultiple = async (request: Request) => {
    const {
        query: { page, order, direction, limit }
    } = request;
    const { sql, totalSql, params } = getUsers({
        order: String(order),
        direction: String(direction)
    });

    return await getGeneralMultiple({
        request,
        sql: getFromTo(sql, Number(page), Number(limit)),
        params,
        totalSql,
        type: currentRoute
    });
};
