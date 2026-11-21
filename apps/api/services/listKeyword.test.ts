import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { testCaller } from "../helper/testing/caller";

// Every list searches itself (?keyword=) since the shared /search is gone: the word reaches the
// SQL only as LIKE parameters, every word must match, and a repeated or bracketed keyword
// parameter searches nothing.
const queryMock = vi.fn();

vi.mock("../db", () => ({ getPool: () => ({}) }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("../helper/query", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../helper/query")>()),
    query: queryMock
}));

const lists = {
    customers: await import("./customers"),
    products: await import("./products"),
    worksheets: await import("./worksheets"),
    invoices: await import("./invoices"),
    users: await import("./users")
};

const request = (query: Record<string, unknown>) =>
    ({ database: "shop", user: testCaller, params: {}, query }) as unknown as Request;

const statements = () =>
    queryMock.mock.calls.map(([call]) => call as { sql: string; params: unknown[] });

beforeEach(() => {
    queryMock.mockReset();
    // No rows; the count statement answers 0
    queryMock.mockImplementation(async ({ sql }: { sql: string }) => ({
        success: true,
        data: /COUNT\(/i.test(sql) ? [{ total: 0 }] : []
    }));
});

describe.each(Object.entries(lists))("%s list", (_name, list) => {
    it("searches with each word as a LIKE parameter, never in the SQL", async () => {
        await list.getMultiple(request({ page: "1", limit: "10", keyword: "orbit 50%" }));

        for (const { sql, params } of statements()) {
            expect(sql).toContain("LIKE ?");
            expect(sql).not.toContain("orbit");
            expect(params).toContain("%orbit%");
            expect(params).toContain("%50\\%%");
        }
    });

    it("lists everything without a word", async () => {
        await list.getMultiple(request({ page: "1", limit: "10" }));

        for (const { sql } of statements()) {
            expect(sql).not.toContain("LIKE");
        }
    });

    it("ignores a keyword that is not one text", async () => {
        await list.getMultiple(request({ page: "1", limit: "10", keyword: ["orbit", "x"] }));

        for (const { sql, params } of statements()) {
            expect(sql).not.toContain("LIKE");
            expect(params).not.toContain("%orbit%");
        }
    });
});

describe("one customer's lists", () => {
    it("search the customer's worksheets by product, the customer kept", async () => {
        await lists.worksheets.getMultiple(request({ page: "1", customer: "9", keyword: "cable" }));

        const [{ sql, params }] = statements();
        expect(sql).toContain("products.name LIKE ?");
        expect(params).toEqual(expect.arrayContaining(["%cable%", 9]));
    });

    it("search the customer's invoices, the customer kept", async () => {
        await lists.invoices.getMultiple(request({ page: "1", customer: "9", keyword: "cable" }));

        expect(statements().every(({ params }) => params.includes(9))).toBe(true);
        expect(statements().every(({ params }) => params.includes("%cable%"))).toBe(true);
    });
});
