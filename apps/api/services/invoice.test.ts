import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { createFakeDb } from "../helper/testing/fakeDb";

const fake = createFakeDb();
const queryMock = vi.fn();

vi.mock("../db", () => ({ getPool: () => fake.pool }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("../helper/query", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../helper/query")>()),
    query: queryMock
}));

const { buildInvoiceLines, deleteSingleItem, postSingle, putSingle, putSingleData, putSingleItem } =
    await import("./invoice");

const request = (parts: { params?: object; body?: object }) =>
    ({ database: "shop", params: {}, body: {}, ...parts }) as unknown as Request;

const cable = {
    id: 3,
    code: "P-3",
    name: "Cable",
    price: 19.99,
    discountPrice: 17.5,
    unit: "pc",
    comment: "1 m"
};

// The products table answers with `products`, the config table with the VAT rate
const databaseHas = (products: object[]) =>
    queryMock.mockImplementation(async ({ sql }: { sql: string }) =>
        /FROM products/.test(sql)
            ? { success: true, data: products }
            : { success: true, data: [{ value: "24" }] }
    );

beforeEach(() => {
    fake.reset();
    queryMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("putSingleItem (quantity of a line)", () => {
    it("sets the quantity of the line on that invoice and the change date of that same invoice", async () => {
        fake.respondWith(() => ({ affectedRows: 1 }));

        const result = await putSingleItem(
            request({ params: { invoiceId: "12", id: "99" }, body: { value: 5 } })
        );

        expect(result).toEqual({ success: true });

        const [line] = fake.statements(/UPDATE invoice_items/);
        const [invoice] = fake.statements(/UPDATE invoices/);

        expect(line.params).toEqual([5, "99", "12"]);
        // it used to be given [quantity, line id], so the invoice with the id 5 got the new date
        expect(invoice.params).toEqual(["12"]);
        expect(fake.connection.commit).toHaveBeenCalledOnce();
    });

    it("refuses a line that is not on the invoice in the URL and changes nothing", async () => {
        fake.respondWith(() => ({ affectedRows: 0 }));

        const result = await putSingleItem(
            request({ params: { invoiceId: "12", id: "99" }, body: { value: 5 } })
        );

        expect(result).toEqual({ success: false, message: "put.invoice.items" });
        expect(fake.statements(/UPDATE invoices/)).toHaveLength(0);
        expect(fake.connection.rollback).toHaveBeenCalledOnce();
    });

    it("refuses a quantity that is not a number, and changes nothing", async () => {
        for (const value of ["x", [5], { a: 5 }, "1e3", "5; DROP TABLE invoices"]) {
            const result = await putSingleItem(
                request({ params: { invoiceId: "12", id: "99" }, body: { value } })
            );

            expect(result, JSON.stringify(value)).toEqual({
                success: false,
                message: "invalidInput"
            });
        }

        expect(fake.pool.getConnection).not.toHaveBeenCalled();
    });

    it("takes the quantity as text, with a comma, and an empty one as 0", async () => {
        fake.respondWith(() => ({ affectedRows: 1 }));

        await putSingleItem(
            request({ params: { invoiceId: "12", id: "99" }, body: { value: "2,5" } })
        );
        await putSingleItem(
            request({ params: { invoiceId: "12", id: "99" }, body: { value: "" } })
        );

        const quantities = fake.statements(/UPDATE invoice_items/).map(({ params }) => params[0]);

        expect(quantities).toEqual([2.5, 0]);
    });
});

describe("deleteSingleItem", () => {
    it("removes the line, opens its worksheet again and sets the invoice's change date", async () => {
        fake.respondWith((sql) => (/SELECT worksheet_id/.test(sql) ? [{ worksheet_id: 11 }] : {}));

        const result = await deleteSingleItem(request({ params: { invoiceId: "12", id: "99" } }));

        expect(result).toEqual({ success: true });
        expect(fake.statements(/DELETE/)[0].params).toEqual(["99"]);

        const [worksheet] = fake.statements(/UPDATE worksheets/);

        // "no invoice" is NULL (the foreign key needs it), and only if the worksheet is on this invoice
        expect(worksheet.sql).toContain("SET invoice = NULL");
        expect(worksheet.params).toEqual([11, "12"]);
        expect(fake.statements(/UPDATE invoices/)[0].params).toEqual(["12"]);
        expect(fake.connection.commit).toHaveBeenCalledOnce();
    });

    it("leaves worksheets alone for a line that did not come from one", async () => {
        fake.respondWith((sql) =>
            /SELECT worksheet_id/.test(sql) ? [{ worksheet_id: null }] : {}
        );

        await deleteSingleItem(request({ params: { invoiceId: "12", id: "99" } }));

        expect(fake.statements(/UPDATE worksheets/)).toHaveLength(0);
    });

    it("refuses a line that is not on the invoice and deletes nothing", async () => {
        fake.respondWith(() => []);

        const result = await deleteSingleItem(request({ params: { invoiceId: "12", id: "99" } }));

        expect(result).toEqual({ success: false, message: "delete.invoice.item" });
        expect(fake.statements(/DELETE/)).toHaveLength(0);
        expect(fake.connection.commit).not.toHaveBeenCalled();
    });
});

describe("buildInvoiceLines", () => {
    it("gives no lines when nothing is asked for", async () => {
        for (const items of [undefined, null, []]) {
            expect(await buildInvoiceLines("shop", items)).toEqual({ lines: [] });
        }
    });

    it("copies the product's data into each line, whatever type the ids have in the request", async () => {
        databaseHas([cable]);

        const result = await buildInvoiceLines("shop", [
            { productId: "3", quantity: "2.5", worksheetId: "11" },
            { productId: 3, quantity: 1 }
        ]);

        expect(result).toEqual({
            lines: [
                { worksheetId: 11, productId: 3, quantity: 2.5, ...pick(cable) },
                { worksheetId: null, productId: 3, quantity: 1, ...pick(cable) }
            ]
        });
    });

    it("says so when a product does not exist, instead of failing on it later", async () => {
        databaseHas([cable]);

        expect(
            await buildInvoiceLines("shop", [
                { productId: 3, quantity: 1 },
                { productId: 404, quantity: 1 }
            ])
        ).toEqual({
            message: "get.product"
        });
    });

    it("refuses lines with ids or quantities that are lists, objects or not numbers, and too many lines", async () => {
        databaseHas([cable]);

        for (const item of [
            { productId: [3], quantity: 1 },
            { productId: "3 OR 1=1", quantity: 1 },
            { productId: 3, quantity: [1] },
            { productId: 3, quantity: 1, worksheetId: { a: 1 } },
            { quantity: 1 },
            "3",
            null
        ]) {
            expect(await buildInvoiceLines("shop", [item]), JSON.stringify(item)).toEqual({
                message: "post.newWorkSheet"
            });
        }

        expect(
            await buildInvoiceLines(
                "shop",
                Array.from({ length: 501 }, () => ({ productId: 3, quantity: 1 }))
            )
        ).toEqual({ message: "post.newWorkSheet" });
    });

    it("refuses a quantity that is not a number and items that are not a list", async () => {
        databaseHas([cable]);

        expect(await buildInvoiceLines("shop", [{ productId: 3, quantity: "lots" }])).toEqual({
            message: "post.newWorkSheet"
        });
        expect(await buildInvoiceLines("shop", { productId: 3 })).toEqual({
            message: "post.newWorkSheet"
        });
    });
});

const pick = ({ code, name, price, discountPrice, unit, comment }: typeof cable) => ({
    code,
    name,
    price,
    discountPrice,
    unit,
    comment
});

describe("postSingle (new invoice)", () => {
    it("creates the invoice and its lines in one transaction", async () => {
        databaseHas([cable]);
        fake.respondWith((sql) => {
            if (/FOR UPDATE/.test(sql)) return [{ value: "41" }];
            if (/MAX\(number_sort\)/.test(sql)) return [{ highest: "41" }];
            if (/INSERT INTO invoices/.test(sql)) return { insertId: 7, affectedRows: 1 };

            return { affectedRows: 1 };
        });

        const result = await postSingle(
            request({ body: { customerId: 5, items: [{ productId: 3, quantity: 2 }] } })
        );

        expect(result).toEqual({ success: true, lastId: 7 });
        expect(fake.statements(/INSERT INTO invoice_items/)).toHaveLength(1);
        expect(fake.pool.getConnection).toHaveBeenCalledOnce();
        expect(fake.connection.commit).toHaveBeenCalledOnce();
    });

    it("does not take an invoice number when a line cannot be built", async () => {
        databaseHas([cable]);

        const result = await postSingle(
            request({ body: { customerId: 5, items: [{ productId: 404, quantity: 2 }] } })
        );

        expect(result).toEqual({ success: false, message: "get.product" });
        expect(fake.pool.getConnection).not.toHaveBeenCalled();
    });

    it("answers with the reason when a worksheet is already on an invoice", async () => {
        databaseHas([cable]);
        fake.respondWith((sql) => {
            if (/FOR UPDATE/.test(sql)) return [{ value: "41" }];
            if (/MAX\(number_sort\)/.test(sql)) return [{ highest: "41" }];
            if (/INSERT INTO invoices/.test(sql)) return { insertId: 7 };
            if (/UPDATE worksheets/.test(sql)) return { affectedRows: 0 };

            return { affectedRows: 1 };
        });

        const result = await postSingle(
            request({
                body: { customerId: 5, items: [{ productId: 3, quantity: 2, worksheetId: 11 }] }
            })
        );

        expect(result).toEqual({ success: false, message: "worksheet.invoiced" });
        expect(fake.connection.commit).not.toHaveBeenCalled();
    });
});

describe("postSingle with a customer that is not a number", () => {
    it("refuses it before anything is read or taken", async () => {
        databaseHas([cable]);

        for (const customerId of [{ a: 1 }, [5], "5 OR 1=1", 0]) {
            const result = await postSingle(request({ body: { customerId, items: [] } }));

            expect(result, JSON.stringify(customerId)).toEqual({
                success: false,
                message: "invalidInput"
            });
        }

        expect(queryMock).not.toHaveBeenCalled();
        expect(fake.pool.getConnection).not.toHaveBeenCalled();
    });
});

describe("putSingleData (invoice details)", () => {
    const draft = {
        id: 7,
        number: "42",
        customerId: 5,
        invoiceDate: "2026-10-21",
        paymentType: "cash",
        invoiceType: "offer",
        items: [{ id: 1 }]
    };

    it("saves the details, takes the payment period from the customer and moves the worksheets along", async () => {
        queryMock.mockImplementation(async ({ sql }: { sql: string }) =>
            /FROM customers/.test(sql)
                ? { success: true, data: [{ paymentPeriod: 30 }] }
                : { success: true, data: [] }
        );

        expect(await putSingleData(request({ body: draft }))).toEqual({ success: true });

        const [update] = queryMock.mock.calls
            .map(([call]) => call)
            .filter(({ sql }: { sql: string }) => /UPDATE invoices/.test(sql));
        const [worksheets] = queryMock.mock.calls
            .map(([call]) => call)
            .filter(({ sql }: { sql: string }) => /UPDATE worksheets/.test(sql));

        expect(update.params).toEqual(["2026-10-21", 5, "42", "cash", "offer", 30, 7]);
        expect(worksheets.params).toEqual([5, 7, 5]);
    });

    const updates = () =>
        queryMock.mock.calls
            .map(([call]) => call)
            .filter(({ sql }: { sql: string }) => /UPDATE (invoices|worksheets)/.test(sql));

    it("does not save the invoice when its customer cannot be read, so it never keeps the old customer's terms", async () => {
        // a failed look-up, and a customer that does not exist
        for (const answer of [
            { success: false, data: [] },
            { success: true, data: [] }
        ]) {
            queryMock.mockReset();
            queryMock.mockImplementation(async ({ sql }: { sql: string }) =>
                /FROM customers/.test(sql) ? answer : { success: true, data: [] }
            );

            expect(await putSingleData(request({ body: draft })), JSON.stringify(answer)).toEqual({
                success: false,
                message: "get.customer"
            });
            expect(updates(), JSON.stringify(answer)).toHaveLength(0);
        }
    });

    it("keeps the invoice's own payment period when its customer has none", async () => {
        queryMock.mockImplementation(async ({ sql }: { sql: string }) =>
            /FROM customers/.test(sql)
                ? { success: true, data: [{ paymentPeriod: null }] }
                : { success: true, data: [] }
        );

        expect(await putSingleData(request({ body: draft }))).toEqual({ success: true });

        const [invoice] = updates();

        expect(invoice.sql).toContain("COALESCE(?, payment_period)");
        expect(invoice.params).toEqual(["2026-10-21", 5, "42", "cash", "offer", null, 7]);
    });

    it("keeps the invoice's own payment period when it has no customer", async () => {
        queryMock.mockResolvedValue({ success: true, data: [] });

        expect(await putSingleData(request({ body: { ...draft, customerId: null } }))).toEqual({
            success: true
        });

        const calls = queryMock.mock.calls.map(([call]) => call);

        // no customer to look up, no worksheets to move, and NULL leaves payment_period alone
        expect(calls).toHaveLength(1);
        expect(calls[0].sql).toContain("COALESCE(?, payment_period)");
        expect(calls[0].params).toEqual(["2026-10-21", null, "42", "cash", "offer", null, 7]);
    });

    it("refuses details that are not valid, without touching the database", async () => {
        for (const change of [
            { id: "7 OR 1=1" },
            { customerId: { a: 1 } },
            { invoiceDate: "tomorrow" },
            { paymentType: "gold" },
            { number: ["42"] }
        ]) {
            expect(
                await putSingleData(request({ body: { ...draft, ...change } })),
                JSON.stringify(change)
            ).toEqual({ success: false, message: "invalidInput" });
        }

        expect(queryMock).not.toHaveBeenCalled();
    });
});

describe("putSingle (add a line to an invoice)", () => {
    it("adds the line, bills the worksheet and sets the change date together", async () => {
        databaseHas([cable]);
        fake.respondWith(() => ({ affectedRows: 1 }));

        const result = await putSingle(
            request({
                body: { invoiceId: 12, items: [{ productId: 3, quantity: 2, worksheetId: 11 }] }
            })
        );

        expect(result).toEqual({ success: true });
        expect(fake.statements(/INSERT INTO invoice_items/)[0].params[0]).toEqual([
            [11, 3, 12, 2, "P-3", "Cable", 19.99, 17.5, "pc", "1 m"]
        ]);
        expect(fake.statements(/UPDATE worksheets/)[0].params).toEqual([12, [11]]);
        expect(fake.statements(/UPDATE invoices/)[0].params).toEqual([12]);
        expect(fake.pool.getConnection).toHaveBeenCalledOnce();
        expect(fake.connection.commit).toHaveBeenCalledOnce();
    });

    it("refuses an invoice id that is not a number", async () => {
        databaseHas([cable]);

        for (const invoiceId of [undefined, [12], "12 OR 1=1", { a: 1 }]) {
            const result = await putSingle(
                request({ body: { invoiceId, items: [{ productId: 3, quantity: 1 }] } })
            );

            expect(result, JSON.stringify(invoiceId)).toEqual({
                success: false,
                message: "invalidInput"
            });
        }

        expect(fake.pool.getConnection).not.toHaveBeenCalled();
    });

    it("says so when the product does not exist, without opening a transaction", async () => {
        databaseHas([]);

        const result = await putSingle(
            request({ body: { invoiceId: 12, items: [{ productId: 404, quantity: 1 }] } })
        );

        expect(result).toEqual({ success: false, message: "get.product" });
        expect(fake.pool.getConnection).not.toHaveBeenCalled();
    });

    it("rolls back the line when the worksheet behind it is already billed", async () => {
        databaseHas([cable]);
        fake.respondWith((sql) => (/UPDATE worksheets/.test(sql) ? { affectedRows: 0 } : {}));

        const result = await putSingle(
            request({
                body: { invoiceId: 12, items: [{ productId: 3, quantity: 2, worksheetId: 11 }] }
            })
        );

        expect(result).toEqual({ success: false, message: "worksheet.invoiced" });
        expect(fake.statements(/UPDATE invoices/)).toHaveLength(0);
        expect(fake.connection.rollback).toHaveBeenCalledOnce();
    });
});
