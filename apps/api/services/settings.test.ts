import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { createFakeDb } from "../helper/testing/fakeDb";

// The invoice counter cannot be set below a number that an invoice already has: the next invoice
// would get a number that is taken, and every invoice after it too. The check and the saving are
// one transaction that locks the counter row first, like creating an invoice does.
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

const { putAll } = await import("./settings");

const request = (body: object, file?: object) =>
    ({ database: "shop", params: {}, query: {}, body, file }) as unknown as Request;

// What the database answers inside the transaction: the counter row holds `counter`, the highest
// invoice number is `highest` (null: that statement returns nothing), and `failing` throws on an
// UPDATE
const databaseHas = (highest: string | null, failing = false) =>
    fake.respondWith((sql) => {
        if (/FOR UPDATE/.test(sql)) return [{ value: "41" }];
        if (/MAX\(number_sort\)/.test(sql)) return highest === null ? [] : [{ highest }];
        if (/UPDATE config/.test(sql) && failing) {
            throw Object.assign(new Error("deadlock"), { code: "ER_LOCK_DEADLOCK" });
        }

        return { affectedRows: 1 };
    });

// Outside the transaction: the logo's file name is read, and plain updates go through query()
const plainQueriesWork = () =>
    queryMock.mockResolvedValue({ success: true, data: [{ value: "" }] });

const order = () =>
    fake.calls.map(({ sql }) =>
        /FOR UPDATE/.test(sql)
            ? "lock"
            : /MAX\(number_sort\)/.test(sql)
              ? "highest"
              : /UPDATE config/.test(sql)
                ? "update"
                : "other"
    );

beforeEach(() => {
    fake.reset();
    queryMock.mockReset();
    deleteImageFile.mockReset();
    plainQueriesWork();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("PUT /settings with lastInvoiceId", () => {
    it("refuses a counter below the highest number used, with its own message, and saves nothing", async () => {
        databaseHas("41");

        expect(await putAll(request({ lastInvoiceId: "36", companyName: "Acme" }))).toEqual({
            success: false,
            message: "lastInvoiceIdTooLow"
        });
        expect(order()).toEqual(["lock", "highest"]);
        expect(fake.connection.commit).not.toHaveBeenCalled();
        expect(fake.connection.rollback).toHaveBeenCalledOnce();
        expect(fake.connection.release).toHaveBeenCalledOnce();
    });

    it("locks the counter row before it reads the highest number, and keeps the lock until the settings are saved", async () => {
        databaseHas("41");

        expect(
            await putAll(request({ lastInvoiceId: "41", companyName: "Acme", invoiceText: "Hi" }))
        ).toMatchObject({ success: true });

        // an invoice created meanwhile either committed before the lock (and is counted) or waits
        expect(order()).toEqual(["lock", "highest", "update", "update"]);
        // one transaction: the settings, short and long, are saved before the lock is released
        expect(fake.pool.getConnection).toHaveBeenCalledOnce();
        expect(fake.connection.commit).toHaveBeenCalledOnce();
        expect(fake.connection.rollback).not.toHaveBeenCalled();
        // and not through the pool, outside the transaction
        expect(queryMock.mock.calls.some(([{ sql }]) => /UPDATE config/.test(sql))).toBe(false);
    });

    it("sees the number of an invoice that was created after the page was loaded", async () => {
        // the page loaded counter 41; invoice 42 has been created since
        databaseHas("42");

        expect(await putAll(request({ lastInvoiceId: "41", companyName: "Acme" }))).toEqual({
            success: false,
            message: "lastInvoiceIdTooLow"
        });
        expect(fake.statements(/UPDATE config/)).toHaveLength(0);
    });

    it("takes a counter at or above the highest number used, as the digits that were sent", async () => {
        for (const value of ["41", "42", "1000"]) {
            fake.reset();
            databaseHas("41");

            expect(await putAll(request({ lastInvoiceId: value })), value).toMatchObject({
                success: true
            });
            expect(fake.statements(/UPDATE config/)[0].params).toContain(value);
        }
    });

    it("takes a counter after an invoice with a 10-digit number was made, which makes the counter 10 digits", async () => {
        databaseHas("2026000001");

        expect(await putAll(request({ lastInvoiceId: "2026000001", vat: "24" }))).toMatchObject({
            success: true
        });
        expect(await putAll(request({ lastInvoiceId: "2026000000" }))).toMatchObject({
            success: false,
            message: "lastInvoiceIdTooLow"
        });
        expect(fake.statements(/UPDATE config/)[0].params).toContain("2026000001");
    });

    it("takes any counter when there are no invoices", async () => {
        databaseHas("0");

        expect(await putAll(request({ lastInvoiceId: "0" }))).toMatchObject({ success: true });
    });

    it("does not touch the counter row, or open a transaction, when the counter is not part of the request", async () => {
        expect(await putAll(request({ companyName: "Acme" }))).toMatchObject({ success: true });

        expect(fake.pool.getConnection).not.toHaveBeenCalled();
        expect(queryMock.mock.calls.some(([{ sql }]) => /UPDATE config/.test(sql))).toBe(true);
    });

    it("saves nothing when the highest number cannot be read, and the request fails", async () => {
        databaseHas(null);

        expect(await putAll(request({ lastInvoiceId: "50" }))).toEqual({
            success: false,
            message: "put.settings.short"
        });
        expect(fake.statements(/UPDATE config/)).toHaveLength(0);
        expect(fake.connection.rollback).toHaveBeenCalledOnce();
    });

    it("rolls everything back when a statement fails after the check", async () => {
        databaseHas("41", true);

        expect(await putAll(request({ lastInvoiceId: "50", invoiceText: "Hi" }))).toEqual({
            success: false,
            message: "put.settings.short"
        });
        expect(fake.connection.commit).not.toHaveBeenCalled();
        expect(fake.connection.rollback).toHaveBeenCalledOnce();
    });

    it("still refuses a counter that is not a number first, before anything is read", async () => {
        databaseHas("41");

        expect(await putAll(request({ lastInvoiceId: "abc" }))).toEqual({
            success: false,
            message: "settingsInvalid"
        });
        expect(fake.pool.getConnection).not.toHaveBeenCalled();
        expect(queryMock).not.toHaveBeenCalled();
    });
});

describe("the logo that came with a refused request", () => {
    const logo = { filename: "logo-1.png" };

    it("is removed when the counter is too low", async () => {
        databaseHas("41");

        await putAll(request({ lastInvoiceId: "36" }, logo));

        expect(deleteImageFile).toHaveBeenCalledWith("logo-1.png");
    });

    it("is removed when the highest number cannot be read", async () => {
        databaseHas(null);

        await putAll(request({ lastInvoiceId: "50" }, logo));

        expect(deleteImageFile).toHaveBeenCalledOnce();
        expect(deleteImageFile).toHaveBeenCalledWith("logo-1.png");
    });

    it("is removed when a statement fails after the check", async () => {
        databaseHas("41", true);

        await putAll(request({ lastInvoiceId: "50" }, logo));

        expect(deleteImageFile).toHaveBeenCalledOnce();
        expect(deleteImageFile).toHaveBeenCalledWith("logo-1.png");
    });

    it("is removed when the first update fails outside the transaction, but not after the settings were saved", async () => {
        queryMock.mockResolvedValue({ success: false, data: [] });
        await putAll(request({ companyName: "Acme" }, logo));

        expect(deleteImageFile).toHaveBeenCalledOnce();

        // the short values are saved (and refer to the logo), the long ones fail: the file stays
        deleteImageFile.mockReset();
        queryMock.mockImplementation(async ({ sql }: { sql: string }) =>
            /long_value/.test(sql)
                ? { success: false, data: [] }
                : { success: true, data: [{ value: "" }] }
        );

        expect(await putAll(request({ companyName: "Acme", invoiceText: "Hi" }, logo))).toEqual({
            success: false,
            message: "put.settings.long"
        });
        expect(deleteImageFile).not.toHaveBeenCalled();
    });

    it("is kept when the settings are saved", async () => {
        databaseHas("41");

        expect(await putAll(request({ lastInvoiceId: "41" }, logo))).toMatchObject({
            success: true,
            resource: "logo-1.png"
        });
        expect(deleteImageFile).not.toHaveBeenCalled();
    });
});
