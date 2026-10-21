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
// highest number on an invoice is `highest`, the new invoice gets id 7, and `billed` is how many of
// the asked-for worksheets were still open
const databaseAnswers =
    (billed: number, counter: string | null = "41", highest = "41") =>
    (sql: string) => {
        if (/FOR UPDATE/.test(sql)) return counter === null ? [] : [{ value: counter }];
        if (/MAX\(number_sort\)/.test(sql)) return [{ highest }];
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
                // number_sort holds the numbers of up to 18 digits; longer ones, typed in by hand,
                // are 0 there
                const sorted = state.numbers.filter((number) => /^\d{1,18}$/.test(number));
                const highest = sorted.reduce(
                    (most, number) => (BigInt(number) > most ? BigInt(number) : most),
                    0n
                );

                return [{ highest: String(highest) }];
            }

            if (/INSERT INTO invoices/.test(sql)) {
                // the unique key compares by the column's collation: trailing spaces do not count,
                // and the digits of other scripts are the same digits
                const folded = (number: string) =>
                    number
                        .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
                        .trimEnd();

                if (
                    state.numbers.some((number) => folded(number) === folded(params[0] as string))
                ) {
                    throw Object.assign(
                        new Error("Duplicate entry for key 'invoices.number_UNIQUE'"),
                        {
                            code: "ER_DUP_ENTRY"
                        }
                    );
                }

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

    it("hands out numbers up to the 18 digits number_sort holds, and stops there", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const state = statefulDatabase("999999999999999997", ["999999999999999997"]);

        expect(await allocate(2)).toEqual(["999999999999999998", "999999999999999999"]);
        expect(state.counter).toBe("999999999999999999");

        // the next number would have 19 digits, and the highest number could no longer be found
        const result = await createInvoiceWithNextNumber({
            database: "shop",
            customerId: 5,
            vat: 24
        });

        expect(result.ok).toBe(false);
        expect(state.numbers).toEqual([
            "999999999999999997",
            "999999999999999998",
            "999999999999999999"
        ]);
        expect(state.counter).toBe("999999999999999999");
    });

    it("is not affected by an invoice number typed in by hand that is longer than the app hands out", async () => {
        // 19 digits and 25 digits, one of them padded with zeros: none can be the same as a number
        // the app gives out (those have 18 digits at most), and none is counted as the highest
        const state = statefulDatabase("5", [
            "5",
            "1000000000000000001",
            "00000000000000000009",
            "1234567890123456789012345"
        ]);

        expect(await allocate(3)).toEqual(["6", "7", "8"]);
        expect(state.counter).toBe("8");
    });

    it("skips a number that the unique key sees as taken, such as a hand-typed 42 with a space after it", async () => {
        // "42 " has number_sort 0 (it is not plain digits), so the highest number is 41, and the
        // unique key still calls it 42
        const state = statefulDatabase("41", ["41", "42 "]);

        expect(await allocate(2)).toEqual(["43", "44"]);
        expect(state.counter).toBe("44");
        // the insert that was refused undid itself, nothing else: one transaction, committed
        expect(fake.connection.rollback).not.toHaveBeenCalled();
        expect(fake.connection.commit).toHaveBeenCalledTimes(2);
    });

    it("skips numbers written in the digits of another script, which the collation reads as the same", async () => {
        // ٤٢ is 42 in Arabic-Indic digits, and ٤٣ is 43
        const state = statefulDatabase("41", ["41", "٤٢", "٤٣"]);

        expect(await allocate(1)).toEqual(["44"]);
        expect(state.counter).toBe("44");
    });

    it("gives up, and creates nothing, when too many numbers in a row are taken", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        // 42 to 62 are taken by numbers with a space after them: more than the 20 that are skipped
        const taken = Array.from({ length: 21 }, (_, index) => `${42 + index} `);
        const state = statefulDatabase("41", ["41", ...taken]);

        const result = await createInvoiceWithNextNumber({
            database: "shop",
            customerId: 5,
            vat: 24
        });

        expect(result).toMatchObject({
            ok: false,
            message: "post.newInvoice",
            code: "ER_DUP_ENTRY"
        });
        expect(state.counter).toBe("41");
        expect(state.numbers).toHaveLength(22);
        expect(fake.connection.commit).not.toHaveBeenCalled();
        expect(fake.connection.rollback).toHaveBeenCalledOnce();
    });

    it("does not skip on any other failure of the insert", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        fake.respondWith((sql) => {
            if (/FOR UPDATE/.test(sql)) return [{ value: "41" }];
            if (/MAX\(number_sort\)/.test(sql)) return [{ highest: "41" }];
            if (/INSERT INTO invoices/.test(sql)) {
                throw Object.assign(new Error("no customer"), { code: "ER_NO_REFERENCED_ROW_2" });
            }

            return { affectedRows: 1 };
        });

        const result = await createInvoiceWithNextNumber({
            database: "shop",
            customerId: 5,
            vat: 24
        });

        expect(result).toMatchObject({ ok: false, code: "ER_NO_REFERENCED_ROW_2" });
        expect(fake.statements(/INSERT INTO invoices/)).toHaveLength(1);
    });

    it("goes on from a counter of 10 digits, as an invoice number like 2026000001 makes it", async () => {
        const state = statefulDatabase("2026000001", ["2026000001"]);

        expect(await allocate(2)).toEqual(["2026000002", "2026000003"]);
        expect(state.counter).toBe("2026000003");
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
        expect(await highestIs({ highest: "41" })).toBe(41n);
        expect(await highestIs({ highest: "0" })).toBe(0n);
    });

    it("is exact for the 18 digits number_sort holds, not rounded", async () => {
        expect(await highestIs({ highest: "999999999999999999" })).toBe(999999999999999999n);
        expect(await highestIs({ highest: "9007199254740993" })).toBe(9007199254740993n);
    });

    it("refuses an answer that is not digits", async () => {
        await expect(highestIs({ highest: "abc" })).rejects.toThrow("not a whole number");
        await expect(highestIs()).rejects.toThrow("not a whole number");
    });
});
