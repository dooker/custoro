import * as Sentry from "@sentry/node";
import type { QueryIF } from "../types";
import { getPool } from "../db";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { SqlError } from "../types/express";
import type { QueryResult } from "../types/query";

const isSqlError = (err: unknown): err is SqlError => {
    return typeof err === "object" && err !== null && ("code" in err || "sqlMessage" in err);
};

// Query parameters hold emails, password hashes and reset-token hashes, so their values never
// leave the server: Sentry and production logs only see each parameter's type. Numbers and
// booleans are ids and flags and stay readable. Development logs keep the full values.
export const redactParams = (params: unknown[]): unknown[] =>
    params.map((param) => {
        if (param === null || param === undefined) return param;
        if (typeof param === "number" || typeof param === "boolean") return param;
        if (typeof param === "string") return `[string, ${param.length} chars]`;
        if (param instanceof Date) return "[date]";

        return `[${Array.isArray(param) ? "array" : typeof param}]`;
    });

// MySQL error texts quote the offending values ("Duplicate entry 'ann@x.example' for key ..."),
// so quoted parts are removed before the text goes to Sentry
export const scrubSqlMessage = (message: string | undefined): string =>
    (message ?? "").replace(/'(?:[^'\\]|\\.)*'/g, "'?'");

// What callers get back on a failed query: a generic key the web app translates, plus the
// MySQL error code for callers that need to tell cases apart (e.g. ER_DUP_ENTRY). The full
// error text stays in the server log, as it names tables, columns and sometimes values.
export const queryErrorMessage = "error";

const logParams = (params: unknown[]) =>
    (process.env.NODE_ENV || "development") === "development" ? params : redactParams(params);

// A parameter is one value: text, a finite number, a boolean, null or a date. mysql2 turns an
// array into a list of values, an object into `key` = value pairs and undefined into NULL, so a
// request body that put one of those where a value belongs would change the statement (or store
// "[object Object]"); NaN and Infinity are no SQL values at all. The transaction helpers pass
// arrays through connection.query on purpose (IN (?) and VALUES ?) and do not come through here.
export const isParamValue = (param: unknown) =>
    param === null ||
    typeof param === "string" ||
    typeof param === "boolean" ||
    typeof param === "bigint" ||
    (typeof param === "number" && Number.isFinite(param)) ||
    param instanceof Date;

// Define a threshold for slow MAMP MySQL queries (200ms)
const SLOW_QUERY_THRESHOLD_MS = 200;

export const query = async <T>({
    database,
    sql,
    params = [],
    logger,
    forceLogger
}: QueryIF): Promise<QueryResult<T>> => {
    const safeParams = Array.isArray(params) ? params : [];
    const badParam = safeParams.findIndex((param) => !isParamValue(param));

    if (badParam !== -1) {
        // Only the position and the type are logged: the value is whatever a client sent
        console.error(
            `Query refused${logger ? ` (${logger})` : ""}: parameter ${badParam + 1} is ${redactParams([safeParams[badParam]])[0]}`
        );

        return { success: false, data: [], message: queryErrorMessage };
    }

    const pool = getPool(database);

    if (forceLogger) {
        console.error("Forcing Logger");
        console.error("SQL:", sql);
        console.error("PARAMS:", logParams(safeParams));
    }

    const startTime = Date.now();

    try {
        const [rows] = await pool.query<RowDataPacket[] | ResultSetHeader>(sql, safeParams);
        const duration = Date.now() - startTime;

        // --- 1. Sentry Slow Query Monitoring ---
        if (duration > SLOW_QUERY_THRESHOLD_MS) {
            Sentry.captureMessage(`Slow MySQL Query (${duration}ms)`, {
                level: "warning",
                tags: {
                    database,
                    logger: logger || "unlabeled"
                },
                extra: {
                    sql,
                    params: redactParams(safeParams),
                    duration,
                    threshold: SLOW_QUERY_THRESHOLD_MS
                }
            });
        }

        // Detect SELECT vs non-SELECT
        const isSelect = sql.trim().toUpperCase().startsWith("SELECT");

        if (isSelect) {
            return {
                success: true,
                data: Array.isArray(rows) ? (rows as T[]) : [],
                message: "OK"
            };
        }

        if (!Array.isArray(rows)) {
            // UPDATE / INSERT / DELETE
            return {
                success: true,
                data: [],
                insertId: rows.insertId ?? null,
                affectedRows: rows.affectedRows,
                message: "OK"
            };
        }

        return {
            success: true,
            data: [],
            insertId: null,
            message: "OK"
        };
    } catch (error) {
        const duration = Date.now() - startTime;
        const now = new Date().toISOString().replace("T", " ").split(".")[0];

        // --- 2. Sentry Error Capture ---
        Sentry.withScope((scope) => {
            scope.setTag("database", database);
            if (logger) scope.setTag("query_logger", logger);

            scope.setExtras({
                sql,
                params: redactParams(safeParams),
                duration,
                sqlErrorCode: isSqlError(error) ? error.code : undefined,
                sqlErrorMessage: isSqlError(error) ? scrubSqlMessage(error.sqlMessage) : undefined
            });

            if (isSqlError(error)) {
                Sentry.captureException(
                    new Error(`[DB Error ${error.code}] ${scrubSqlMessage(error.sqlMessage)}`)
                );
            } else if (error instanceof Error) {
                Sentry.captureException(error);
            } else {
                Sentry.captureMessage("Unknown Database Error", "error");
            }
        });

        // Your existing local console logging logic
        if (isSqlError(error)) {
            console.error(`\n--- DB QUERY FAILED ${logger ? `(${logger})` : ""} ---`);
            console.error("Timestamp:", now);
            console.error("SQL:", sql);
            console.error("PARAMS:", logParams(safeParams));
            console.error("CODE:", error.code);
            console.error("ERROR:", error.sqlMessage);
            console.error("----------------------------------------\n");

            return {
                success: false,
                data: [],
                code: error.code,
                message: queryErrorMessage
            };
        }

        console.error(`\n--- DB QUERY FAILED ${logger ? `(${logger})` : ""} ---`);
        console.error("Timestamp:", now);
        console.error("ERROR:", error);

        return {
            success: false,
            data: [],
            message: queryErrorMessage
        };
    }
};
