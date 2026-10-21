import type { Request, RequestHandler } from "express";

// MySQL turns the leading digits of a text into a number when it compares it with an INT column,
// so /customer/1%20OR%201=1 and /customer/1;DROP%20TABLE%20users found customer 1, and
// /customer/1e3 found customer 1000. An id in a path is checked before anything is queried.

// What the web app translates ("notification.error"), the same key a failed query answers with
export const invalidIdMessage = "error";

// A positive whole number as digits, up to the largest INT (no sign, no "1e3", no spaces)
export const isRowId = (value: unknown): boolean =>
    typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2147483647;

// Lets the request through when `valid` accepts its path parameters, and answers with
// success: false when it does not (the API answers with HTTP 200 and success: false, like any
// other refusal). Put it after authenticate and authorize, so who is not logged in learns
// nothing from the answer, and before an upload, so a refused request never writes a file.
export const requireParams =
    (valid: (params: Request["params"]) => boolean): RequestHandler =>
    (req, res, next) => {
        if (valid(req.params)) {
            return next();
        }

        res.json({ success: false, message: invalidIdMessage });
    };

// Every named path parameter is an id
export const requireIds = (...names: string[]) =>
    requireParams((params) => names.every((name) => isRowId(params[name])));
