import { vi } from "vitest";

// A stand-in for the mysql2 pool in unit tests: every statement is recorded, and `respond` decides
// the result of each one. Query results have the shape mysql2 returns, [rows or header, fields].
export const createFakeDb = () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const state: { respond: (sql: string, params: unknown[]) => unknown } = {
        respond: () => []
    };

    const connection = {
        beginTransaction: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined),
        release: vi.fn(),
        query: vi.fn(async (sql: string, params: unknown[] = []) => {
            calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });

            return [state.respond(sql, params), undefined];
        })
    };
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };

    return {
        calls,
        connection,
        pool,
        respondWith: (respond: (sql: string, params: unknown[]) => unknown) => {
            state.respond = respond;
        },
        // The statements run so far that match, in order
        statements: (pattern: RegExp) => calls.filter(({ sql }) => pattern.test(sql)),
        reset: () => {
            calls.length = 0;
            state.respond = () => [];
            vi.clearAllMocks();
            connection.beginTransaction.mockResolvedValue(undefined);
            connection.commit.mockResolvedValue(undefined);
            connection.rollback.mockResolvedValue(undefined);
            pool.getConnection.mockResolvedValue(connection);
        }
    };
};
