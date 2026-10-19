import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { createFakeDb } from "../helper/testing/fakeDb";

const fake = createFakeDb();

vi.mock("../db", () => ({ getPool: () => fake.pool }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));

const { deleteSingle } = await import("./worksheet");

const remove = (id = "9") =>
    deleteSingle({ database: "shop", params: { id } } as unknown as Request);

// What the database holds for worksheet 9: its `locked` flag and the invoices its lines are on
const worksheet = (locked: "0" | "1", lines: { locked: number }[]) =>
    fake.respondWith((sql) => {
        if (/FROM worksheets/.test(sql)) return [{ locked }];
        if (/FROM invoice_items/.test(sql) && /SELECT/.test(sql)) return lines;

        return {};
    });

beforeEach(() => {
    fake.reset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("deleteSingle (worksheet)", () => {
    it("deletes the worksheet together with its lines on invoices that are still open", async () => {
        worksheet("0", [{ locked: 0 }]);

        expect(await remove()).toEqual({ success: true });

        const deletes = fake.statements(/DELETE/);

        // the lines first: the foreign key refuses to delete a worksheet that still has lines
        expect(
            deletes.map(({ sql }) => (/invoice_items/.test(sql) ? "lines" : "worksheet"))
        ).toEqual(["lines", "worksheet"]);
        expect(deletes.every(({ params }) => params[0] === "9")).toBe(true);
        expect(fake.connection.commit).toHaveBeenCalledOnce();
    });

    it("deletes a worksheet that was never on an invoice", async () => {
        worksheet("0", []);

        expect(await remove()).toEqual({ success: true });
        expect(fake.statements(/DELETE\s+FROM worksheets/)).toHaveLength(1);
    });

    it("refuses a worksheet whose line is on a locked invoice, and deletes nothing", async () => {
        worksheet("0", [{ locked: 0 }, { locked: 1 }]);

        expect(await remove()).toEqual({ success: false, message: "worksheet.locked" });
        expect(fake.statements(/DELETE/)).toHaveLength(0);
        expect(fake.connection.commit).not.toHaveBeenCalled();
        expect(fake.connection.rollback).toHaveBeenCalledOnce();
    });

    it("refuses a worksheet that is paid (locked), whatever its lines say", async () => {
        worksheet("1", []);

        expect(await remove()).toEqual({ success: false, message: "worksheet.locked" });
        expect(fake.statements(/DELETE/)).toHaveLength(0);
    });

    it("answers success for a worksheet that does not exist, as before, without deleting anything", async () => {
        fake.respondWith(() => []);

        expect(await remove("404")).toEqual({ success: true });
        expect(fake.statements(/DELETE/)).toHaveLength(0);
    });

    it("answers with the generic key when the database fails", async () => {
        fake.respondWith((sql) => {
            if (/FROM worksheets/.test(sql)) return [{ locked: "0" }];
            if (/FROM invoice_items/.test(sql) && /SELECT/.test(sql)) return [];
            throw Object.assign(new Error("gone"), { code: "ER_LOCK_DEADLOCK" });
        });

        expect(await remove()).toEqual({ success: false, message: "delete.worksheet" });
        expect(fake.connection.rollback).toHaveBeenCalledOnce();
    });
});
