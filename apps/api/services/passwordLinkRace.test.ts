import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { createFakeDb } from "../helper/testing/fakeDb";

// A password link is mailed to the address the account had when it was looked up. If the email
// changes in between (an admin corrects it, the user changes it), saving the link by id alone
// would install it again after the change cancelled it, and mail it to the old address. It is
// saved only while the account still has that exact address, and mailed only if it was.
const fake = createFakeDb();
const queryMock = vi.fn();
const emailMock = vi.fn();

vi.mock("../db", () => ({ getPool: () => fake.pool }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("../helper/query", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../helper/query")>()),
    query: queryMock
}));
vi.mock("./_helpers", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./_helpers")>()),
    email: emailMock,
    getConfig: vi.fn(async () => ({
        success: true,
        data: { subject: "Password", text: "[RESTORE_LINK]", html: "[RESTORE_LINK]" }
    }))
}));

const user = await import("./user");
const profile = await import("./profile");

const tokenUpdates = () =>
    queryMock.mock.calls.map(([call]) => call).filter(({ sql }) => /forgot_token/.test(sql));

// The token UPDATE finds the account with the address (1 row) or not any more (0 rows)
const database = (tokenRows: number) =>
    queryMock.mockImplementation(async ({ sql }: { sql: string }) => {
        if (/COUNT/.test(sql)) return { success: true, data: [{ count: 0 }] };
        if (/INSERT/.test(sql)) return { success: true, data: {}, insertId: 7 };
        if (/SELECT id, username/.test(sql.replace(/\s+/g, " ")))
            return { success: true, data: [{ id: 7, username: "ann@example.test" }] };
        if (/forgot_token/.test(sql)) return { success: true, data: {}, affectedRows: tokenRows };

        return { success: true, data: {} };
    });

beforeEach(() => {
    fake.reset();
    queryMock.mockReset();
    emailMock.mockReset();
    emailMock.mockResolvedValue({ success: true });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("a new user's password link", () => {
    const request = {
        database: "shop",
        params: {},
        query: {},
        body: { name: "Ann", username: "ann@example.test", discount: "0", offer: "0", role: "user" }
    } as unknown as Request;

    it("is saved only for the account with that exact address", async () => {
        database(1);

        await user.postSingle(request);

        expect(tokenUpdates()[0].sql).toMatch(/username COLLATE utf8mb4_bin = \?/);
        expect(tokenUpdates()[0].params.at(-1)).toBe("ann@example.test");
        expect(emailMock).toHaveBeenCalledOnce();
    });

    it("is not mailed when the address changed before it was saved", async () => {
        database(0);

        expect(await user.postSingle(request)).toMatchObject({
            success: true,
            message: "user.passwordLinkFailed"
        });
        expect(emailMock).not.toHaveBeenCalled();
    });
});

describe("a reset link", () => {
    const forgot = () =>
        profile.forgot("ann@example.test", {
            database: "shop",
            ip: "203.0.113.7"
        } as unknown as Request);

    it("is saved only for the account with the address it is mailed to", async () => {
        database(1);

        await forgot();
        await vi.waitFor(() => expect(emailMock).toHaveBeenCalledOnce());

        expect(tokenUpdates()[0].sql).toMatch(/username COLLATE utf8mb4_bin = \?/);
        expect(emailMock.mock.calls[0][0].email).toBe("ann@example.test");
    });

    it("is not mailed when the address changed before it was saved", async () => {
        database(0);

        expect(await forgot()).toEqual({ success: true });
        await vi.waitFor(() => expect(tokenUpdates()).toHaveLength(1));
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(emailMock).not.toHaveBeenCalled();
    });
});
