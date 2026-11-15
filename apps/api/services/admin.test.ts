import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { createFakeDb } from "../helper/testing/fakeDb";

const fake = createFakeDb();

vi.mock("../db", () => ({ getPool: () => fake.pool }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));

const { saveAdmin } = await import("./admin");

const input = {
    database: "shop",
    tenantId: 1,
    username: "boss@example.test",
    name: "Boss",
    reset: false
};
const password = "correct horse battery";

// What the look-up for the username finds; company 1 exists, and the install has an owner when
// `hasOwner` says so
let hasOwner = false;
const existing = (...rows: { id: number }[]) =>
    fake.respondWith((sql) => {
        if (/FROM tenants/.test(sql)) return /WHERE id = \?/.test(sql) ? [{ id: 1 }] : [];
        if (/WHERE owner = 1/.test(sql)) return hasOwner ? [{ id: 9 }] : [];
        if (/WHERE username = \?/.test(sql)) return rows;

        return {};
    });

beforeEach(() => {
    fake.reset();
    hasOwner = false;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("saveAdmin", () => {
    it("creates an admin whose password is stored as a hash", async () => {
        existing();

        expect(await saveAdmin({ ...input, password })).toEqual({ ok: true, created: true });

        const [insert] = fake.statements(/INSERT INTO users/);

        expect(insert.sql).toContain("role = 'admin'");
        expect(insert.params.slice(0, 3)).toEqual([1, "boss@example.test", "Boss"]);
        expect(insert.params).not.toContain(password);
        expect(await bcrypt.compare(password, insert.params[3] as string)).toBe(true);
        // the first admin of an install without an owner is its owner
        expect(insert.params[4]).toBe(1);
        expect(fake.connection.commit).toHaveBeenCalledOnce();
    });

    it("makes a later admin, or one of another company, no owner", async () => {
        hasOwner = true;
        existing();

        expect(await saveAdmin({ ...input, tenantId: 1, password })).toEqual({
            ok: true,
            created: true
        });
        expect(fake.statements(/INSERT INTO users/)[0].params[4]).toBe(0);
    });

    it("refuses a company that does not exist, and creates nobody", async () => {
        fake.respondWith((sql) => (/FROM tenants/.test(sql) ? [] : /SELECT/.test(sql) ? [] : {}));

        expect(await saveAdmin({ ...input, tenantId: 7, password })).toEqual({
            ok: false,
            message: "tenant.missing"
        });
        expect(fake.statements(/INSERT INTO users/)).toHaveLength(0);
    });

    it("refuses an email that is taken and changes nothing", async () => {
        existing({ id: 4 });

        expect(await saveAdmin({ ...input, password })).toEqual({
            ok: false,
            message: "user.exists"
        });
        expect(fake.statements(/^(INSERT|UPDATE) /)).toHaveLength(0);
        expect(fake.connection.rollback).toHaveBeenCalledOnce();
    });

    it("with reset gives the existing user the password and the admin role, and ends their sessions", async () => {
        existing({ id: 4 });

        expect(await saveAdmin({ ...input, password, reset: true })).toEqual({
            ok: true,
            created: false
        });

        const [update] = fake.statements(/UPDATE users/);

        expect(update.sql).toContain("role = 'admin'");
        expect(update.sql).toContain("token_version = token_version + 1");
        expect(update.sql).toContain("forgot_token = NULL");
        expect(update.params[1]).toBe(4);
        expect(await bcrypt.compare(password, update.params[0] as string)).toBe(true);
        expect(fake.statements(/INSERT/)).toHaveLength(0);
    });

    it("with reset refuses an email nobody has, instead of creating an account for a typo", async () => {
        existing();

        expect(await saveAdmin({ ...input, password, reset: true })).toEqual({
            ok: false,
            message: "get.user"
        });
        expect(fake.statements(/^(INSERT|UPDATE) /)).toHaveLength(0);
    });

    it("refuses a password that is too short or too long, before it touches the database", async () => {
        for (const bad of ["", "short", "x".repeat(73)]) {
            expect(await saveAdmin({ ...input, password: bad })).toEqual({
                ok: false,
                message: "passwordLength"
            });
        }

        expect(fake.pool.getConnection).not.toHaveBeenCalled();
    });

    it("answers with the generic error when the database fails", async () => {
        fake.respondWith(() => {
            throw Object.assign(new Error("down"), { code: "ECONNRESET" });
        });

        expect(await saveAdmin({ ...input, password })).toEqual({ ok: false, message: "error" });
    });
});
