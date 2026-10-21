import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./testing/fakeDb";

const fake = createFakeDb();

vi.mock("../db", () => ({ getPool: () => fake.pool }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));

const { createInvoiceWithNextNumber, getHighestNumber } = await import("./invoiceNumber");

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

// What the database answers: the counter row holds `counter` (null: there is no such row), the
// highest number on an invoice is `highest` (`highestLong` is the highest of the numbers of more
// than 18 digits, which number_sort cannot hold), the new invoice gets id 7, and `billed` is how
// many of the asked-for worksheets were still open
const databaseAnswers =
    (
        billed: number,
        counter: string | null = "41",
        highest = "41",
        highestLong: string | null = null
    ) =>
    (sql: string) => {
        if (/FOR UPDATE/.test(sql)) return counter === null ? [] : [{ value: counter }];
        if (/MAX\(number_sort\)/.test(sql)) return [{ highest, highestLong }];
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
            if (/MAX\(number_sort\)/.test(sql)) return [{ highest: "41" }];
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

    it("goes on from the highest number on an invoice when the counter was set below it", async () => {
        // the counter says 36, but invoice 41 exists: the next number is 42, not 37 (taken)
        fake.respondWith(databaseAnswers(0, "36", "41"));

        const result = await createInvoiceWithNextNumber({
            database: "shop",
            customerId: 5,
            vat: 24
        });

        expect(result).toEqual({ ok: true, value: { id: 7, number: 42 } });
        expect(fake.statements(/INSERT INTO invoices/)[0].params).toEqual(["42", 5, 24]);
        // and the counter is corrected with it
        expect(fake.statements(/UPDATE config/)[0].params).toEqual(["42"]);
    });

    it("keeps to the counter when it is the larger, and when there are no invoices", async () => {
        fake.respondWith(databaseAnswers(0, "100", "41"));
        await createInvoiceWithNextNumber({ database: "shop", customerId: 5, vat: 24 });

        expect(fake.statements(/INSERT INTO invoices/)[0].params[0]).toBe("101");

        fake.reset();
        fake.respondWith(databaseAnswers(0, "0", "0"));
        await createInvoiceWithNextNumber({ database: "shop", customerId: 5, vat: 24 });

        expect(fake.statements(/INSERT INTO invoices/)[0].params[0]).toBe("1");
    });

    it("counts numbers longer than JavaScript can add one to", async () => {
        fake.respondWith(databaseAnswers(0, "41", "123456789012345678"));

        await createInvoiceWithNextNumber({ database: "shop", customerId: 5, vat: 24 });

        expect(fake.statements(/INSERT INTO invoices/)[0].params[0]).toBe("123456789012345679");
    });

    it("reads the highest number after it has locked the counter, from the invoice index", async () => {
        fake.respondWith(databaseAnswers(0));

        await createInvoiceWithNextNumber({ database: "shop", customerId: 5, vat: 24 });

        const order = fake.calls.map(({ sql }) =>
            /FOR UPDATE/.test(sql) ? "lock" : /MAX\(number_sort\)/.test(sql) ? "max" : "other"
        );

        expect(order.slice(0, 2)).toEqual(["lock", "max"]);
    });

    // A database that keeps its state between invoices: the counter, and the numbers on invoices
    // (number_sort is 0 for a number of more than 18 digits, so the highest number ignores those)
    const statefulDatabase = (counter: string, numbers: string[] = []) => {
        const state = { counter, numbers: [...numbers] };

        fake.respondWith((sql, params) => {
            if (/FOR UPDATE/.test(sql)) return [{ value: state.counter }];
            if (/MAX\(number_sort\)/.test(sql)) {
                const highestOf = (numbers: string[]) =>
                    numbers.reduce(
                        (most, number) => (BigInt(number) > most ? BigInt(number) : most),
                        0n
                    );
                // number_sort holds the numbers of up to 18 digits; the longer ones are 0 there
                const sorted = state.numbers.filter((number) => /^\d{1,18}$/.test(number));
                const long = state.numbers.filter((number) => /^\d{19,25}$/.test(number));

                return [
                    {
                        highest: String(highestOf(sorted)),
                        highestLong: long.length ? String(highestOf(long)) : null
                    }
                ];
            }

            if (/INSERT INTO invoices/.test(sql)) {
                state.numbers.push(params[0] as string);

                return { insertId: state.numbers.length, affectedRows: 1 };
            }

            if (/UPDATE config/.test(sql)) {
                state.counter = params[0] as string;
            }

            return { affectedRows: 1 };
        });

        return state;
    };

    const allocate = async (times: number) => {
        const numbers: string[] = [];

        for (let index = 0; index < times; index++) {
            const result = await createInvoiceWithNextNumber({
                database: "shop",
                customerId: 5,
                vat: 24
            });

            expect(result.ok, `number ${index + 1}`).toBe(true);
            numbers.push(String(fake.statements(/INSERT INTO invoices/).at(-1)?.params[0]));
        }

        return numbers;
    };

    it("hands out consecutive numbers past 15 digits, where Number() rounds the counter", async () => {
        // 2^53 + 1 is the first whole number a double cannot hold
        const state = statefulDatabase("9007199254740990");

        expect(await allocate(5)).toEqual([
            "9007199254740991",
            "9007199254740992",
            "9007199254740993",
            "9007199254740994",
            "9007199254740995"
        ]);
        expect(state.counter).toBe("9007199254740995");
    });

    it("hands out consecutive numbers across 18 to 19 digits, never the same twice", async () => {
        // the 19-digit numbers have number_sort 0, so only the counter carries them on
        const state = statefulDatabase("999999999999999997", ["999999999999999997"]);
        const numbers = await allocate(6);

        expect(numbers).toEqual([
            "999999999999999998",
            "999999999999999999",
            "1000000000000000000",
            "1000000000000000001",
            "1000000000000000002",
            "1000000000000000003"
        ]);
        expect(new Set(numbers).size).toBe(numbers.length);
        expect(state.counter).toBe("1000000000000000003");
    });

    it("goes on from the highest number of 19 to 25 digits, which number_sort cannot hold", async () => {
        // an invoice numbered 1000000000000000001 (number_sort 0) and a counter set below it
        const state = statefulDatabase("1000000000000000000", ["5", "1000000000000000001"]);

        expect(await allocate(3)).toEqual([
            "1000000000000000002",
            "1000000000000000003",
            "1000000000000000004"
        ]);
        expect(state.counter).toBe("1000000000000000004");
    });

    it("recovers from a counter below a 25-digit number, and stops when the next one would have 26", async () => {
        const low = statefulDatabase("41", ["41", "1234567890123456789012345"]);

        expect(await allocate(1)).toEqual(["1234567890123456789012346"]);
        expect(low.counter).toBe("1234567890123456789012346");

        // 25 nines is the last number invoices.number can hold: the next one does not fit
        fake.reset();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const full = statefulDatabase("41", ["41", "9".repeat(25)]);
        const result = await createInvoiceWithNextNumber({
            database: "shop",
            customerId: 5,
            vat: 24
        });

        expect(result.ok).toBe(false);
        expect(full.numbers).toEqual(["41", "9".repeat(25)]);
        expect(full.counter).toBe("41");
    });

    it("is not led astray by a padded long number that is smaller than the highest", async () => {
        // invoices 37, 41 and 00000000000000000009 (the number 9, written with 20 characters)
        const state = statefulDatabase("36", ["37", "41", "00000000000000000009"]);

        expect(await allocate(2)).toEqual(["42", "43"]);
        expect(state.counter).toBe("43");
    });

    it("goes on from a counter of 10 digits, as an invoice number like 2026000001 makes it", async () => {
        const state = statefulDatabase("2026000001", ["2026000001"]);

        expect(await allocate(2)).toEqual(["2026000002", "2026000003"]);
        expect(state.counter).toBe("2026000003");
    });

    it("stops when the next number would not fit invoices.number (25 digits)", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        statefulDatabase("9".repeat(25));

        const result = await createInvoiceWithNextNumber({
            database: "shop",
            customerId: 5,
            vat: 24
        });

        expect(result.ok).toBe(false);
        expect(fake.statements(/INSERT INTO invoices/)).toHaveLength(0);
        expect(fake.connection.rollback).toHaveBeenCalledOnce();
    });

    it("takes a counter with spaces around the digits, and still refuses text that is not digits", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        fake.respondWith(databaseAnswers(0, " 41 ", "41"));

        expect(
            (await createInvoiceWithNextNumber({ database: "shop", customerId: 5, vat: 24 })).ok
        ).toBe(true);

        for (const counter of ["-5", "4 1", "0x10", "1e3", ""]) {
            fake.reset();
            fake.respondWith(databaseAnswers(0, counter, "0"));

            expect(
                (await createInvoiceWithNextNumber({ database: "shop", customerId: 5, vat: 24 }))
                    .ok,
                counter
            ).toBe(false);
        }
    });

    it("fails without creating anything when the highest number is not a number", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        fake.respondWith(databaseAnswers(0, "41", "abc"));

        const result = await createInvoiceWithNextNumber({
            database: "shop",
            customerId: 5,
            vat: 24
        });

        expect(result.ok).toBe(false);
        expect(fake.statements(/INSERT INTO invoices/)).toHaveLength(0);
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

describe("getHighestNumber", () => {
    const highestIs = async (...rows: object[]) => {
        fake.respondWith(() => rows);

        return getHighestNumber(fake.connection as never);
    };

    it("is the highest number number_sort holds, and 0 when there are no invoices", async () => {
        expect(await highestIs({ highest: "41", highestLong: null })).toBe(41n);
        expect(await highestIs({ highest: "0", highestLong: null })).toBe(0n);
        // an older statement without the second column
        expect(await highestIs({ highest: "41" })).toBe(41n);
    });

    it("is the highest number of more than 18 digits when there is one, which is above any other", async () => {
        expect(
            await highestIs({ highest: "999999999999999999", highestLong: "1000000000000000000" })
        ).toBe(1000000000000000000n);
        // exact, not rounded
        expect(await highestIs({ highest: "5", highestLong: "1234567890123456789012345" })).toBe(
            1234567890123456789012345n
        );
        // a number with leading zeros is the number it spells
        expect(await highestIs({ highest: "5", highestLong: "00000000000000000009" })).toBe(9n);
    });

    it("is the larger of the two: a long number with leading zeros can be the smaller", async () => {
        // "00000000000000000009" has 20 characters and the value 9
        expect(await highestIs({ highest: "41", highestLong: "00000000000000000009" })).toBe(41n);
        expect(await highestIs({ highest: "0", highestLong: "0000000000000000000" })).toBe(0n);
        // padded and still larger
        expect(await highestIs({ highest: "41", highestLong: "00000000000000000100" })).toBe(100n);
    });

    it("refuses an answer that is not digits", async () => {
        await expect(highestIs({ highest: "abc" })).rejects.toThrow("not a whole number");
        await expect(highestIs()).rejects.toThrow("not a whole number");
        await expect(highestIs({ highest: "5", highestLong: "12x" })).rejects.toThrow(
            "not a whole number"
        );
    });
});
