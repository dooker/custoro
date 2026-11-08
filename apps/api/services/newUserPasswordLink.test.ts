import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { createFakeDb } from "../helper/testing/fakeDb";
import { hashResetToken } from "../helpers/passwordReset";

// A user made on the users page has no password. The API mails them a link to set one (the reset
// page and email, valid for 7 days) and tells the admin whether it went out.
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

process.env.APP_ORIGIN = "https://app.example.test";

const user = await import("./user");

const request = {
    database: "shop",
    params: {},
    query: {},
    body: { name: "Ann", username: "ann@example.test", discount: "0", offer: "0", role: "user" }
} as unknown as Request;

// The email is free, the INSERT gives id 7, the token UPDATE succeeds
const databaseAccepts = () =>
    queryMock.mockImplementation(async ({ sql }: { sql: string }) => {
        if (/COUNT/.test(sql)) return { success: true, data: [{ count: 0 }] };
        if (/INSERT/.test(sql)) return { success: true, data: {}, insertId: 7 };

        return { success: true, data: {} };
    });

const tokenUpdate = () => queryMock.mock.calls.find(([{ sql }]) => /forgot_token/.test(sql))?.[0];

beforeEach(() => {
    fake.reset();
    queryMock.mockReset();
    emailMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /user", () => {
    it("mails the new user a 7-day link to set the password, to the stored address", async () => {
        databaseAccepts();
        emailMock.mockResolvedValue({ success: true });
        const before = Date.now();

        expect(await user.postSingle(request)).toEqual({
            success: true,
            insertId: 7,
            message: "user.passwordLinkSent"
        });

        const [{ email, replace }] = emailMock.mock.calls[0];
        const link: string = replace["[RESTORE_LINK]"];
        const token = link.replace("https://app.example.test/restore/", "");

        expect(email).toBe("ann@example.test");
        expect(token).toMatch(/^[0-9a-f]{64}$/);

        // Only the hash is stored, with an expiry about 7 days ahead, for the new user's id
        const [hash, expires, id] = tokenUpdate().params;
        const days = (new Date(`${expires}Z`).getTime() - before) / (24 * 60 * 60 * 1000);

        expect(hash).toBe(hashResetToken(token));
        expect(id).toBe(7);
        expect(days).toBeGreaterThan(6.99);
        expect(days).toBeLessThan(7.01);
    });

    it("keeps the user and says so when the email could not be sent", async () => {
        databaseAccepts();
        emailMock.mockResolvedValue({ success: false, message: "missingInfo" });

        expect(await user.postSingle(request)).toEqual({
            success: true,
            insertId: 7,
            message: "user.passwordLinkFailed"
        });
    });

    it("sends nothing when the user was not created", async () => {
        queryMock.mockImplementation(async ({ sql }: { sql: string }) =>
            /COUNT/.test(sql)
                ? { success: true, data: [{ count: 1 }] }
                : { success: true, data: {}, insertId: 7 }
        );

        expect(await user.postSingle(request)).toEqual({ success: false, message: "user.exists" });
        expect(emailMock).not.toHaveBeenCalled();
    });
});
