import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";

// The login email is unique. A look-up before the insert cannot stop two requests that run at the
// same time, so the database's own refusal (ER_DUP_ENTRY) has to give the same answer as the look-up
const queryMock = vi.fn();
const deleteImageFile = vi.fn();

vi.mock("../db", () => ({ getPool: () => ({}) }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("../helper/query", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../helper/query")>()),
    query: queryMock
}));
vi.mock("./_helpers", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./_helpers")>()),
    deleteImageFile
}));

const user = await import("./user");
const profile = await import("./profile");

const ann = {
    name: "Ann",
    username: "ann@example.test",
    discount: "1",
    offer: "0",
    role: "user"
};
const file = { filename: "avatar-1.png" };

const request = (parts: { params?: object; body?: unknown; file?: object; user?: object }) =>
    ({ database: "shop", params: {}, body: {}, query: {}, ...parts }) as unknown as Request;

const duplicate = { success: false, data: [], code: "ER_DUP_ENTRY", message: "error" };
const deadlock = { success: false, data: [], code: "ER_LOCK_DEADLOCK", message: "error" };

// The look-up finds no other user with the email (count 0) and the user being changed exists;
// then `answer` is what the INSERT or UPDATE gets
const databaseAnswers = (answer: object) =>
    queryMock.mockImplementation(async ({ sql }: { sql: string }) => {
        if (/SELECT COUNT/.test(sql)) return { success: true, data: [{ count: 0 }] };
        if (/SELECT avatar/.test(sql)) return { success: true, data: [{ avatar: "" }] };

        return answer;
    });

beforeEach(() => {
    queryMock.mockReset();
    deleteImageFile.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /user with an email that another request took first", () => {
    it("answers user.exists, like the look-up does, and drops the avatar", async () => {
        databaseAnswers(duplicate);

        expect(await user.postSingle(request({ body: ann, file }))).toEqual({
            success: false,
            message: "user.exists"
        });
        expect(deleteImageFile).toHaveBeenCalledWith("avatar-1.png");
    });

    it("answers user.exists when the look-up already finds the email, and drops the avatar", async () => {
        queryMock.mockResolvedValue({ success: true, data: [{ count: 1 }] });

        expect(await user.postSingle(request({ body: ann, file }))).toEqual({
            success: false,
            message: "user.exists"
        });
        expect(deleteImageFile).toHaveBeenCalledWith("avatar-1.png");
    });

    it("keeps the generic answer for any other failure", async () => {
        databaseAnswers(deadlock);

        expect(await user.postSingle(request({ body: ann }))).toMatchObject({
            success: false,
            message: "error"
        });
    });

    it("creates the user, and keeps the avatar, when the database accepts", async () => {
        databaseAnswers({ success: true, data: [], insertId: 7 });

        expect(await user.postSingle(request({ body: ann, file }))).toEqual({
            success: true,
            insertId: 7
        });
        expect(deleteImageFile).not.toHaveBeenCalled();
    });
});

describe("PUT /user/:id with an email that another request took first", () => {
    it("answers user.exists, and drops the avatar", async () => {
        databaseAnswers(duplicate);

        expect(await user.putSingle(request({ params: { id: "2" }, body: ann, file }))).toEqual({
            success: false,
            message: "user.exists"
        });
        expect(deleteImageFile).toHaveBeenCalledWith("avatar-1.png");
    });

    it("keeps put.user for any other failure", async () => {
        databaseAnswers(deadlock);

        expect(await user.putSingle(request({ params: { id: "2" }, body: ann }))).toEqual({
            success: false,
            message: "put.user"
        });
    });
});

describe("PUT /profile with an email that another request took first", () => {
    // The caller keeps their email, so no password is needed to get as far as the UPDATE
    const own = { id: 2, role: "user", tv: 0 };
    const body = { name: "Ann", email: "ann@example.test" };

    beforeEach(() => {
        queryMock.mockImplementation(async ({ sql }: { sql: string }) =>
            /SELECT username/.test(sql)
                ? {
                      success: true,
                      data: [{ username: "ann@example.test", password: null, avatar: "" }]
                  }
                : duplicate
        );
    });

    it("answers user.exists", async () => {
        expect(await profile.putSingle(request({ body, user: own }))).toEqual({
            success: false,
            message: "user.exists"
        });
    });

    it("keeps put.profile for any other failure", async () => {
        queryMock.mockImplementation(async ({ sql }: { sql: string }) =>
            /SELECT username/.test(sql)
                ? {
                      success: true,
                      data: [{ username: "ann@example.test", password: null, avatar: "" }]
                  }
                : deadlock
        );

        expect(await profile.putSingle(request({ body, user: own }))).toEqual({
            success: false,
            message: "put.profile"
        });
    });
});
