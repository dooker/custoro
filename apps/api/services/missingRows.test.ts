import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";

// A row that is not there (or a query that failed) is an answer of success: false, not a
// TypeError that ends in an error 500
const queryMock = vi.fn();
const deleteImageFile = vi.fn();

vi.mock("../db", () => ({ getPool: () => ({}) }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("../helper/query", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../helper/query")>()),
    query: queryMock
}));

const helpers = await import("./_helpers");
const user = await import("./user");
const invoice = await import("./invoice");

const request = (parts: { params?: object; body?: unknown; file?: object; query?: object }) =>
    ({ database: "shop", params: {}, body: {}, query: {}, ...parts }) as unknown as Request;

const noRows = { success: true, data: [], message: "OK" };
const failed = { success: false, data: [], message: "error" };

const ann = {
    name: "Ann",
    username: "ann@example.test",
    discount: "1",
    offer: "0",
    role: "user"
};

beforeEach(() => {
    queryMock.mockReset();
    deleteImageFile.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("PUT /user/:id for a user that does not exist", () => {
    it("answers success: false and changes nothing", async () => {
        queryMock.mockResolvedValue(noRows);

        const result = await user.putSingle(request({ params: { id: "9999" }, body: ann }));

        expect(result).toEqual({ success: false, message: "get.user" });
        // only the look-up ran: no username check, no update
        expect(queryMock).toHaveBeenCalledOnce();
        expect(queryMock.mock.calls[0][0].sql).toContain("SELECT avatar");
    });

    it("answers success: false when the look-up fails", async () => {
        queryMock.mockResolvedValue(failed);

        expect(await user.putSingle(request({ params: { id: "2" }, body: ann }))).toEqual({
            success: false,
            message: "get.user"
        });
    });

    it("saves a user that exists, and gives back the avatar it already has", async () => {
        queryMock.mockImplementation(async ({ sql }: { sql: string }) =>
            /SELECT avatar/.test(sql)
                ? { success: true, data: [{ avatar: "ann.png" }] }
                : /COUNT/.test(sql)
                  ? { success: true, data: [{ count: 0 }] }
                  : { success: true, data: [] }
        );

        expect(await user.putSingle(request({ params: { id: "2" }, body: ann }))).toEqual({
            success: true,
            filename: "ann.png"
        });
    });
});

describe("DELETE /user/:id for a user that does not exist", () => {
    it("answers success: false and deletes nothing", async () => {
        queryMock.mockResolvedValue(noRows);

        expect(await user.deleteSingle(request({ params: { id: "9999" } }))).toEqual({
            success: false,
            message: "get.user"
        });
        expect(queryMock).toHaveBeenCalledOnce();
    });

    it("deletes a user that exists", async () => {
        queryMock.mockImplementation(async ({ sql }: { sql: string }) =>
            /SELECT avatar/.test(sql)
                ? { success: true, data: [{ avatar: "" }] }
                : { success: true, data: [] }
        );

        expect(await user.deleteSingle(request({ params: { id: "2" } }))).toEqual({
            success: true
        });
        expect(queryMock).toHaveBeenCalledTimes(2);
    });
});

describe("deleteImage", () => {
    it("answers success: false for a user that does not exist, or when the look-up fails", async () => {
        for (const answer of [noRows, failed]) {
            queryMock.mockResolvedValue(answer);

            expect(await helpers.deleteImage(request({ params: { id: "9999" } }))).toEqual({
                success: false,
                message: "get.avatar"
            });
        }

        expect(queryMock).toHaveBeenCalledTimes(2);
    });

    it("clears the avatar of a user that has one", async () => {
        queryMock.mockImplementation(async ({ sql }: { sql: string }) =>
            /SELECT avatar/.test(sql)
                ? { success: true, data: [{ avatar: "" }] }
                : { success: true, data: [] }
        );

        expect(await helpers.deleteImage(request({ params: { id: "2" } }))).toEqual({
            success: true
        });
        expect(queryMock.mock.calls[1][0].sql).toContain("UPDATE users");
    });
});

describe("lists and the last invoice number", () => {
    it("do not throw when the count query failed", async () => {
        queryMock.mockResolvedValue(failed);

        const result = await helpers.getGeneralMultiple({
            request: request({ query: {} }),
            sql: "SELECT 1",
            params: [],
            totalSql: "SELECT 1",
            type: "customers"
        });

        expect(result).toMatchObject({ success: false, meta: { total: 0 } });
    });

    it("answers null when there is no counter yet", async () => {
        queryMock.mockResolvedValue(noRows);

        expect(await invoice.getLast(request({}))).toEqual({ success: true, data: null });
    });
});
