import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./testing/fakeDb";

const fake = createFakeDb();

vi.mock("../db", () => ({ getPool: () => fake.pool }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));

const { createInvoiceWithNextNumber } = await import("./invoiceNumber");

const line = (worksheetId: number | null, productId = 3) => ({
    worksheetId,
    productId,
    quantity: 2,
    code: "P-3",
    name: "Cable",
    price: 19.99,
    discountPrice: 17.5,
    unit: "pc",
    comment: ""
});

// What the database answers: the counter row holds `counter` (null: there is no such row), the new
// invoice gets id 7, and `billed` is how many of the asked-for worksheets were still open
const databaseAnswers =
    (billed: number, counter: string | null = "41") =>
    (sql: string) => {
        if (/FOR UPDATE/.test(sql)) return counter === null ? [] : [{ value: counter }];
        if (/INSERT INTO invoices/.test(sql)) return { insertId: 7, affectedRows: 1 };
        if (/UPDATE worksheets/.test(sql)) return { affectedRows: billed };

        return { affectedRows: 1 };
    };

beforeEach(() => fake.reset());

describe("createInvoiceWithNextNumber", () => {
    it("takes the next number, creates the invoice and its lines, and bumps the counter - in one transaction", async () => {
        fake.respondWith(databaseAnswers(2));

        const result = await createInvoiceWithNextNumber({
            database: "shop",
            customerId: 5,
            vat: 24,
            lines: [line(11), line(12, 4), line(null, 5)]
        });

        expect(result).toEqual({ ok: true, value: { id: 7, number: 42 } });

        const [counter] = fake.statements(/FOR UPDATE/);
        const [invoice] = fake.statements(/INSERT INTO invoices/);
        const [bump] = fake.statements(/UPDATE config/);
        const [lines] = fake.statements(/INSERT INTO invoice_items/);
        const [billed] = fake.statements(/UPDATE worksheets/);

        expect(counter.sql).toContain("lastInvoiceId");
        expect(invoice.params).toEqual(["42", 5, 24]);
        expect(bump.params).toEqual(["42"]);

        // every line is stored with the new invoice's id, in a single statement
        const rows = (lines.params[0] as unknown[][]).map((row) => [
            row[0],
            row[1],
            row[2],
            row[3]
        ]);

        expect(rows).toEqual([
            [11, 3, 7, 2],
            [12, 4, 7, 2],
            [null, 5, 7, 2]
        ]);
        expect(fake.statements(/INSERT INTO invoice_items/)).toHaveLength(1);

        // the worksheets are marked as billed on this invoice, each once, only while still open
        expect(billed.sql).toContain("invoice IS NULL");
        expect(billed.params).toEqual([7, [11, 12]]);

        expect(fake.connection.commit).toHaveBeenCalledOnce();
        expect(fake.connection.rollback).not.toHaveBeenCalled();
        expect(fake.pool.getConnection).toHaveBeenCalledOnce();
    });

    it("creates an invoice without lines and without touching worksheets", async () => {
        fake.respondWith(databaseAnswers(0));

        const result = await createInvoiceWithNextNumber({
            database: "shop",
            customerId: null,
            vat: "24"
        });

        expect(result).toEqual({ ok: true, value: { id: 7, number: 42 } });
        expect(fake.statements(/INSERT INTO invoice_items/)).toHaveLength(0);
        expect(fake.statements(/UPDATE worksheets/)).toHaveLength(0);
        expect(fake.statements(/INSERT INTO invoices/)[0].params).toEqual(["42", null, "24"]);
    });

    it("refuses and rolls back everything when a worksheet is already on an invoice", async () => {
        // two worksheets asked for, only one was still open
        fake.respondWith(databaseAnswers(1));

        const result = await createInvoiceWithNextNumber({
            database: "shop",
            customerId: 5,
            vat: 24,
            lines: [line(11), line(12)]
        });

        expect(result).toEqual({ ok: false, message: "worksheet.invoiced" });
        expect(fake.connection.commit).not.toHaveBeenCalled();
        expect(fake.connection.rollback).toHaveBeenCalledOnce();
        expect(fake.connection.release).toHaveBeenCalledOnce();
    });

    it("rolls back the number, the invoice and the lines when a statement fails", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        fake.respondWith((sql) => {
            if (/FOR UPDATE/.test(sql)) return [{ value: "41" }];
            if (/INSERT INTO invoices/.test(sql)) return { insertId: 7 };
            if (/INSERT INTO invoice_items/.test(sql)) {
                throw Object.assign(new Error("fk"), { code: "ER_NO_REFERENCED_ROW_2" });
            }

            return { affectedRows: 1 };
        });

        const result = await createInvoiceWithNextNumber({
            database: "shop",
            customerId: 5,
            vat: 24,
            lines: [line(null)]
        });

        expect(result).toEqual({
            ok: false,
            message: "post.newInvoice",
            code: "ER_NO_REFERENCED_ROW_2"
        });
        expect(fake.connection.commit).not.toHaveBeenCalled();
        expect(fake.connection.rollback).toHaveBeenCalledOnce();
    });

    it("fails without creating anything when the counter is missing or not a number", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        for (const counter of [null, "abc", "4.5"]) {
            fake.reset();
            fake.respondWith(databaseAnswers(0, counter));

            const result = await createInvoiceWithNextNumber({
                database: "shop",
                customerId: 5,
                vat: 24
            });

            expect(result.ok, String(counter)).toBe(false);
            expect(fake.statements(/INSERT INTO invoices/), String(counter)).toHaveLength(0);
            expect(fake.connection.rollback, String(counter)).toHaveBeenCalledOnce();
        }
    });
});
