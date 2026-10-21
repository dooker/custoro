import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./testing/fakeDb";

const fake = createFakeDb();

vi.mock("../db", () => ({ getPool: () => fake.pool }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));

const { TransactionRefusal, withTransaction } = await import("./transaction");
const Sentry = await import("@sentry/node");

const run = (work: Parameters<typeof withTransaction>[3]) =>
    withTransaction("shop", "Test work", "fallback.key", work);

beforeEach(() => fake.reset());

describe("withTransaction", () => {
    it("commits what the work did and hands back its value", async () => {
        const result = await run(async () => 42);

        expect(result).toEqual({ ok: true, value: 42 });
        expect(fake.connection.beginTransaction).toHaveBeenCalledOnce();
        expect(fake.connection.commit).toHaveBeenCalledOnce();
        expect(fake.connection.rollback).not.toHaveBeenCalled();
        expect(fake.connection.release).toHaveBeenCalledOnce();
    });

    it("rolls everything back when the work fails and answers with the fallback key", async () => {
        const failure = Object.assign(new Error("boom"), { code: "ER_NO_REFERENCED_ROW_2" });

        vi.spyOn(console, "error").mockImplementation(() => undefined);

        const result = await run(async () => {
            throw failure;
        });

        expect(result).toEqual({
            ok: false,
            message: "fallback.key",
            code: "ER_NO_REFERENCED_ROW_2"
        });
        expect(fake.connection.commit).not.toHaveBeenCalled();
        expect(fake.connection.rollback).toHaveBeenCalledOnce();
        expect(fake.connection.release).toHaveBeenCalledOnce();
        expect(Sentry.captureException).toHaveBeenCalledOnce();
    });

    it("answers with the fallback key, not an exception, when there is no connection to start from", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        fake.pool.getConnection.mockRejectedValueOnce(
            Object.assign(new Error("Queue limit reached."), { code: "POOL_ENQUEUELIMIT" })
        );
        const work = vi.fn(async () => 1);

        const result = await run(work);

        expect(result).toEqual({
            ok: false,
            message: "fallback.key",
            code: "POOL_ENQUEUELIMIT"
        });
        expect(work).not.toHaveBeenCalled();
        expect(fake.connection.beginTransaction).not.toHaveBeenCalled();
        // there was no connection to give back
        expect(fake.connection.release).not.toHaveBeenCalled();
        expect(Sentry.captureException).toHaveBeenCalledOnce();
    });

    it("answers the same when the database cannot be reached at all", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        fake.pool.getConnection.mockRejectedValueOnce(new Error("connect ETIMEDOUT 10.0.0.5:3306"));

        expect(await run(async () => 1)).toEqual({
            ok: false,
            message: "fallback.key",
            code: undefined
        });
    });

    it("answers a refusal with its own key, without reporting it as a fault", async () => {
        const result = await run(async () => {
            throw new TransactionRefusal("worksheet.locked");
        });

        expect(result).toEqual({ ok: false, message: "worksheet.locked" });
        expect(fake.connection.rollback).toHaveBeenCalledOnce();
        expect(fake.connection.commit).not.toHaveBeenCalled();
        expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it("keeps MySQL's quoted values out of Sentry", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        await run(async () => {
            throw Object.assign(new Error("db"), {
                code: "ER_DUP_ENTRY",
                sqlMessage: "Duplicate entry 'ann@x.example' for key 'username_UNIQUE'"
            });
        });

        const reported = vi.mocked(Sentry.captureException).mock.calls[0][0] as Error;

        expect(reported.message).toBe("[DB Error ER_DUP_ENTRY] Duplicate entry '?' for key '?'");
        expect(reported.message).not.toContain("ann@x.example");
    });

    it("still gives the connection back when the rollback itself fails", async () => {
        fake.connection.rollback.mockRejectedValue(new Error("connection lost"));

        const result = await run(async () => {
            throw new TransactionRefusal("refused");
        });

        expect(result).toEqual({ ok: false, message: "refused" });
        expect(fake.connection.release).toHaveBeenCalledOnce();
    });
});
