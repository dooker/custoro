import { beforeEach, describe, expect, it, vi } from "vitest";

// The owner page's list and single read (issue 42): paged and searched like the other lists,
// every value a ? parameter
const queryMock = vi.fn();

vi.mock("../db", () => ({ getPool: () => ({}) }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("../helper/query", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../helper/query")>()),
    query: queryMock
}));

const { getTenant, listTenants } = await import("./tenants");

const row = { id: 3, name: "Orbit", active: 1, created: "2026-11-15", people: 2, invoices: 7 };

beforeEach(() => {
    queryMock.mockReset();
});

describe("listTenants", () => {
    it("answers a page with the number of pages, like the other lists", async () => {
        queryMock
            .mockResolvedValueOnce({ success: true, data: [{ total: 21 }] })
            .mockResolvedValueOnce({ success: true, data: [row] });

        expect(await listTenants("shop", { page: "3", limit: "10" })).toEqual({
            success: true,
            resource: [row],
            meta: { page: 3, pages: 3, rows: 21, limit: 10, total: 3 }
        });

        // counted first, so the page is known before the rows are read
        const [count, list] = queryMock.mock.calls.map(([call]) => call);
        expect(list.sql).toContain("LIMIT 20, 10");
        expect(list.params).toEqual([]);
        expect(count.sql).toContain("COUNT(*)");
    });

    it("searches the name word by word, each word a parameter with LIKE's wildcards as text", async () => {
        queryMock.mockResolvedValue({ success: true, data: [{ total: 0 }] });

        await listTenants("shop", { keyword: "orbit 50%" });

        for (const [{ sql, params }] of queryMock.mock.calls) {
            expect(sql).toContain("WHERE (tenants.name LIKE ?) AND (tenants.name LIKE ?)");
            expect(sql).not.toContain("orbit");
            expect(params).toEqual(["%orbit%", "%50\\%%"]);
        }
    });

    it("answers the last page for a page past the end", async () => {
        queryMock
            .mockResolvedValueOnce({ success: true, data: [{ total: 21 }] })
            .mockResolvedValueOnce({ success: true, data: [row] });

        const answer = await listTenants("shop", { page: "99", limit: "10" });

        expect(answer).toMatchObject({ meta: { page: 3, pages: 3 } });
        expect(queryMock.mock.calls[1][0].sql).toContain("LIMIT 20, 10");
    });

    it("ignores a keyword that is not text and a page size over the maximum", async () => {
        queryMock
            .mockResolvedValueOnce({ success: true, data: [{ total: 0 }] })
            .mockResolvedValueOnce({ success: true, data: [] });

        await listTenants("shop", { keyword: ["x"], limit: "5000" });

        const [{ sql, params }] = queryMock.mock.calls[1];
        expect(sql).not.toContain("LIKE");
        expect(sql).toContain("LIMIT 0, 50");
        expect(params).toEqual([]);
    });

    it("answers the general error when a statement fails", async () => {
        queryMock.mockResolvedValue({ success: false, data: [] });

        expect(await listTenants("shop", {})).toEqual({ success: false, message: "error" });
    });
});

describe("getTenant", () => {
    it("answers one company in the shape of the other single reads", async () => {
        queryMock.mockResolvedValue({ success: true, data: [row] });

        expect(await getTenant("shop", 3)).toEqual({ success: true, data: [row] });
        expect(queryMock.mock.calls[0][0].params).toEqual([3]);
    });

    it("tells a missing company from a failed statement", async () => {
        queryMock.mockResolvedValueOnce({ success: true, data: [] });
        expect(await getTenant("shop", 99)).toEqual({ success: false, message: "notFound" });

        queryMock.mockResolvedValueOnce({ success: false, data: [] });
        expect(await getTenant("shop", 99)).toEqual({ success: false, message: "error" });
    });
});
