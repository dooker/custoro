import * as Sentry from "@sentry/node";
import type { QueryIF } from "../types";
import { getPool } from "../db";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { SqlError } from "../types/express";
import type { QueryResult } from "../types/query";

const isSqlError = (err: unknown): err is SqlError => {
    return typeof err === "object" && err !== null && ("code" in err || "sqlMessage" in err);
};

// Define a threshold for slow MAMP MySQL queries (200ms)
const SLOW_QUERY_THRESHOLD_MS = 200;

export const query = async <T>({
    database,
    sql,
    params = [],
    logger,
    forceLogger
}: QueryIF): Promise<QueryResult<T>> => {
    const pool = getPool(database);
    const safeParams = Array.isArray(params) ? params : [];

    if (forceLogger) {
        console.error("Forcing Logger");
        console.error("SQL:", sql);
        console.error("PARAMS:", params);
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
                    params: safeParams,
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
                params: safeParams,
                duration,
                sqlErrorCode: isSqlError(error) ? error.code : undefined,
                sqlErrorMessage: isSqlError(error) ? error.sqlMessage : undefined
            });

            if (isSqlError(error)) {
                Sentry.captureException(new Error(`[DB Error ${error.code}] ${error.sqlMessage}`));
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
            console.error("PARAMS:", params);
            console.error("CODE:", error.code);
            console.error("ERROR:", error.sqlMessage);
            console.error("----------------------------------------\n");

            return {
                success: false,
                data: [],
                message: error.sqlMessage || error.message || "Database error"
            };
        }

        if (error instanceof Error) {
            return {
                success: false,
                data: [],
                message: error.message
            };
        }

        return {
            success: false,
            data: [],
            message: "Unknown error"
        };
    }
};
