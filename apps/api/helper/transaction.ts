import * as Sentry from "@sentry/node";
import type { PoolConnection } from "mysql2/promise";
import { getPool } from "../db";
import { scrubSqlMessage } from "./query";

/**
 * An expected refusal inside a transaction (a rule the request breaks, not a fault): the work is
 * rolled back and `key` is the message the web app shows. Nothing is reported to Sentry.
 */
export class TransactionRefusal extends Error {
    constructor(public readonly key: string) {
        super(key);
    }
}

export type TransactionResult<T> =
    { ok: true; value: T } | { ok: false; message: string; code?: string };

/**
 * Runs `work` on one connection inside one transaction: everything it does is committed together,
 * or - when it throws - rolled back, so a request never leaves half of its changes behind.
 *
 * A thrown TransactionRefusal comes back as `{ ok: false, message }` with its key. Any other error
 * is logged and sent to Sentry and comes back as `fallbackMessage`, with the MySQL error code when
 * there is one (e.g. ER_NO_REFERENCED_ROW_2) so a caller can tell cases apart.
 */
export const withTransaction = async <T>(
    database: string,
    logger: string,
    fallbackMessage: string,
    work: (connection: PoolConnection) => Promise<T>
): Promise<TransactionResult<T>> => {
    const failed = (error: unknown): TransactionResult<T> => {
        if (error instanceof TransactionRefusal) {
            return { ok: false, message: error.key };
        }

        const { code, sqlMessage } = (error ?? {}) as { code?: string; sqlMessage?: string };

        // The server log keeps the full error. Sentry gets MySQL's text with the quoted values
        // removed, like helper/query.ts does, since it can quote emails and other stored data.
        console.error(`${logger} failed:`, error);
        Sentry.captureException(
            sqlMessage !== undefined
                ? new Error(`[DB Error ${code}] ${scrubSqlMessage(sqlMessage)}`)
                : error,
            { tags: { logger } }
        );

        return { ok: false, message: fallbackMessage, code };
    };

    let connection: PoolConnection;

    // No connection (the database does not answer, or the queue for one is full) is a failure
    // like any other, not an exception for the caller: it has files to remove and an answer to give
    try {
        connection = await getPool(database).getConnection();
    } catch (error) {
        return failed(error);
    }

    try {
        await connection.beginTransaction();

        const value = await work(connection);

        await connection.commit();

        return { ok: true, value };
    } catch (error) {
        await connection.rollback().catch(() => undefined);

        return failed(error);
    } finally {
        connection.release();
    }
};
