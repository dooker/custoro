import type { Request } from "express";
import { authUser } from "./authorize";

/**
 * The company of the caller: set by `authenticate` from the person's row in the database, never
 * from the token, a header, the URL or the body. Every query on a company table filters by it.
 * A request without one (a route that forgot `authenticate`) throws instead of reading every
 * company's rows.
 */
export const tenantOf = (request: Request): number => {
    const tenantId = authUser(request)?.tenantId;

    if (!Number.isInteger(tenantId) || (tenantId as number) < 1) {
        throw new Error("The request has no company: is authenticate missing on this route?");
    }

    return tenantId as number;
};
