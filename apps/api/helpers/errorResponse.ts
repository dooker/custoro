import { STATUS_CODES } from "node:http";
import type { NextFunction, Request, Response } from "express";

export const error500 = "500 - Internal Server Booboo.";

// The HTTP status of an error that is the client's doing (an oversized body is 413, malformed
// JSON 400, an unsupported encoding 415): body-parser and the other http-errors carry it as
// `status` and `statusCode`. Anything else, or any 5xx, is the server's own problem.
export const clientErrorStatus = (error: unknown): number | undefined => {
    if (typeof error !== "object" || error === null) {
        return undefined;
    }

    const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
    const code = typeof status === "number" ? status : statusCode;

    return typeof code === "number" && Number.isInteger(code) && code >= 400 && code < 500
        ? code
        : undefined;
};

// The last error handler. A request the client got wrong is answered with its own 4xx status and
// the standard text for it, never the error's own message (which can quote the body); everything
// else is a 500 with a generic text, and the details stay in the log.
export const errorHandler = (error: unknown, _req: Request, res: Response, next: NextFunction) => {
    // If a response was already partially sent, let Express close the connection
    if (res.headersSent) {
        return next(error);
    }

    const status = clientErrorStatus(error);

    if (status) {
        console.error(`Request refused: ${status} ${(error as { type?: string }).type ?? ""}`);

        return res.status(status).json({
            success: false,
            message: STATUS_CODES[status] ?? "Bad Request"
        });
    }

    console.error("Unhandled error:", error);

    return res.status(500).json({ message: error500 });
};
