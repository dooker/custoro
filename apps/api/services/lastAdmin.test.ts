import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { createFakeDb } from "../helper/testing/fakeDb";

// Without an admin nobody can manage users or settings, and a production install can only make a
// new admin from the command line. So the last admin can be neither deleted nor made a regular user.
const fake = createFakeDb();
const queryMock = vi.fn();
const deleteImageFile = vi.fn();

vi.mock("../db", () => ({ getPool: () => fake.pool }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("../helper/query", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../helper/query")>()),
    query: queryMock
}));
vi.mock("./_helpers", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./_helpers")>()),
    deleteImageFile
}));

const user = await import("./user");

const request = (parts: { params?: object; body?: unknown }) =>
    ({ database: "shop", params: {}, body: {}, query: {}, ...parts }) as unknown as Request;

const body = (role: string) => ({
    name: "Ann",
    username: "ann@example.test",
    discount: "1",
    offer: "0",
    role
});

// The users with role admin, as the locking SELECT sees them
const admins = (...ids: number[]) =>
    fake.respondWith((sql) => (/FOR UPDATE/.test(sql) ? ids.map((id) => ({ id })) : {}));

const refusal = { success: false, message: "user.lastAdmin" };

beforeEach(() => {
    fake.reset();
    queryMock.mockReset();
    deleteImageFile.mockReset();
    // the user exists, has an avatar, and the email is free
    queryMock.mockImplementation(async ({ sql }: { sql: string }) =>
        /COUNT/.test(sql)
            ? { success: true, data: [{ count: 0 }] }
            : { success: true, data: [{ avatar: "ann.png" }] }
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("DELETE /user/:id", () => {
    it("refuses the only admin, deletes nothing and keeps the avatar", async () => {
        admins(2);

        expect(await user.deleteSingle(request({ params: { id: "2" } }))).toEqual(refusal);
        expect(fake.statements(/DELETE/)).toHaveLength(0);
        expect(fake.connection.rollback).toHaveBeenCalledOnce();
        expect(deleteImageFile).not.toHaveBeenCalled();
    });

    it("deletes an admin while another admin remains, and then the avatar", async () => {
        admins(1, 2);

        expect(await user.deleteSingle(request({ params: { id: "2" } }))).toEqual({
            success: true
        });
        expect(fake.statements(/DELETE\s+FROM users/).map(({ params }) => params)).toEqual([[2]]);
        expect(deleteImageFile).toHaveBeenCalledWith("ann.png");
    });

    it("deletes a regular user while there is only one admin", async () => {
        admins(1);

        expect(await user.deleteSingle(request({ params: { id: "2" } }))).toEqual({
            success: true
        });
        expect(fake.statements(/DELETE\s+FROM users/)).toHaveLength(1);
    });

    it("locks the admins before it decides, so two deletes cannot both pass", async () => {
        admins(1, 2);

        await user.deleteSingle(request({ params: { id: "2" } }));

        const order = fake.calls.map(({ sql }) => (/FOR UPDATE/.test(sql) ? "lock" : sql));

        expect(order[0]).toBe("lock");
        expect(order[1]).toMatch(/^DELETE/);
    });

    it("keeps the generic answer when the database fails", async () => {
        fake.respondWith(() => {
            throw Object.assign(new Error("down"), { code: "ER_LOCK_DEADLOCK" });
        });

        expect(await user.deleteSingle(request({ params: { id: "2" } }))).toEqual({
            success: false,
            message: "error"
        });
        expect(deleteImageFile).not.toHaveBeenCalled();
    });
});

describe("PUT /user/:id", () => {
    it("refuses to make the only admin a regular user, and changes nothing", async () => {
        admins(2);

        expect(await user.putSingle(request({ params: { id: "2" }, body: body("user") }))).toEqual(
            refusal
        );
        expect(fake.statements(/UPDATE users/)).toHaveLength(0);
    });

    it("makes an admin a regular user while another admin remains", async () => {
        admins(1, 2);

        expect(
            await user.putSingle(request({ params: { id: "2" }, body: body("user") }))
        ).toMatchObject({ success: true });
        expect(fake.statements(/UPDATE users/)).toHaveLength(1);
    });

    it("saves the only admin as an admin without locking anything", async () => {
        admins(2);

        expect(
            await user.putSingle(request({ params: { id: "2" }, body: body("admin") }))
        ).toMatchObject({ success: true });
        expect(fake.statements(/FOR UPDATE/)).toHaveLength(0);
        expect(fake.statements(/UPDATE users/)).toHaveLength(1);
    });
});
