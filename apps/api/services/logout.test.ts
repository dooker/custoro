import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";

// Logging out ends the account's sessions in the API, not only in the browser: the token version
// every token carries moves on, so authenticate refuses the old tokens from the next request on
const queryMock = vi.fn();

vi.mock("../db", () => ({ getPool: () => ({}) }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("../helper/query", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../helper/query")>()),
    query: queryMock
}));

const { logout } = await import("./login");

const request = (user: unknown) => ({ database: "shop", user }) as unknown as Request;

beforeEach(() => {
    queryMock.mockReset();
});

describe("logout", () => {
    it("moves the caller's token version on, and nobody else's", async () => {
        queryMock.mockResolvedValue({ success: true, data: [] });

        expect(await logout(request({ id: 7, role: "user", tv: 3 }))).toEqual({ success: true });

        const [{ sql, params }] = queryMock.mock.calls.map(([call]) => call);

        expect(sql).toContain("SET token_version = token_version + 1");
        expect(params).toEqual([7]);
    });

    it("says so when the database cannot save it", async () => {
        queryMock.mockResolvedValue({ success: false });

        expect(await logout(request({ id: 7, role: "user", tv: 3 }))).toEqual({
            success: false,
            message: "logoutFailed"
        });
    });

    it("does nothing without a caller", async () => {
        expect(await logout(request(undefined))).toEqual({
            success: false,
            message: "invalid.token"
        });
        expect(queryMock).not.toHaveBeenCalled();
    });
});
