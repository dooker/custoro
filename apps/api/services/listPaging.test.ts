import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { testCaller } from "../helper/testing/caller";

// A list page: the rows are counted first, so a page past the end answers with the last page,
// and the answer says which page it is, how many pages and rows there are, and the page size.
const queryMock = vi.fn();

vi.mock("../db", () => ({ getPool: () => ({}) }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("../helper/query", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../helper/query")>()),
    query: queryMock
}));

const { getGeneralMultiple } = await import("./_helpers");

const list = (query: Record<string, unknown>) =>
    getGeneralMultiple({
        request: { database: "shop", user: testCaller, params: {}, query } as unknown as Request,
        sql: "SELECT id FROM customers WHERE tenant_id = ?",
        totalSql: "SELECT COUNT(*) AS total FROM customers WHERE tenant_id = ?",
        params: [1],
        type: "customers"
    });

const counts = (total: number) =>
    queryMock.mockImplementation(async ({ sql }: { sql: string }) => ({
        success: true,
        data: /COUNT\(/.test(sql) ? [{ total }] : [{ id: 1 }]
    }));

const rowsSql = () => queryMock.mock.calls[1][0].sql as string;

beforeEach(() => {
    queryMock.mockReset();
});

describe("getGeneralMultiple", () => {
    it("counts first, then reads the page asked for", async () => {
        counts(40);

        expect(await list({ page: "2", limit: "15" })).toEqual({
            success: true,
            resource: [{ id: 1 }],
            meta: { page: 2, pages: 3, rows: 40, limit: 15 }
        });
        expect(queryMock.mock.calls[0][0].sql).toContain("COUNT(*)");
        expect(rowsSql()).toMatch(/LIMIT 15, 15\s*$/);
    });

    it("reads the last page for a page past the end", async () => {
        counts(40);

        expect((await list({ page: "999", limit: "15" })).meta).toMatchObject({ page: 3 });
        expect(rowsSql()).toMatch(/LIMIT 30, 15\s*$/);
    });

    it("reads page 1 when nothing matches", async () => {
        counts(0);

        expect((await list({ page: "4", limit: "15" })).meta).toEqual({
            page: 1,
            pages: 0,
            rows: 0,
            limit: 15
        });
        expect(rowsSql()).toMatch(/LIMIT 0, 15\s*$/);
    });

    it("reads no rows when the count failed", async () => {
        queryMock.mockResolvedValue({ success: false, data: [] });

        expect(await list({ page: "1" })).toMatchObject({ success: false, resource: [] });
        expect(queryMock).toHaveBeenCalledTimes(1);
    });
});
