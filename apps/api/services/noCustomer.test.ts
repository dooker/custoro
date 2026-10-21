import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";

// An invoice does not need a customer (customer_id can be NULL), and a paid one is read like any
// other. query() refuses an undefined parameter, which is what looking up "the customer of an
// invoice without one" used to send.
const queryMock = vi.fn();

vi.mock("../db", () => ({ getPool: () => ({}) }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("../helper/query", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../helper/query")>()),
    query: queryMock
}));

const customer = await import("./customer");
const invoice = await import("./invoice");

const request = (params: object) => ({ database: "shop", params, body: {} }) as unknown as Request;

const invoiceRow = (customerId: number | null, locked: number) => ({
    id: 7,
    number: "42",
    customer_id: customerId,
    create_date: "2026-10-01T00:00:00.000Z",
    change_date: "2026-10-01T00:00:00.000Z",
    invoice_date: "2026-10-01T00:00:00.000Z",
    payment_type: "cash",
    invoice_type: "invoice",
    locked,
    vat: 24,
    sent_date: null,
    hash: null,
    filename: null,
    payment_period: 14
});

const databaseHas = (row: object) =>
    queryMock.mockImplementation(async ({ sql }: { sql: string }) => {
        if (/FROM invoices/.test(sql)) return { success: true, data: [row] };
        if (/FROM customers/.test(sql)) return { success: true, data: [{ id: 5, name: "Acme" }] };

        return { success: true, data: [] };
    });

const customerQueries = () =>
    queryMock.mock.calls.map(([call]) => call).filter(({ sql }) => /FROM customers/.test(sql));

beforeEach(() => {
    queryMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("reading an invoice", () => {
    it("works for a paid invoice that has no customer, and does not look for one", async () => {
        databaseHas(invoiceRow(null, 1));

        const result = await invoice.getSingle(request({ page: "7" }));

        expect(result).toMatchObject({ success: true, data: [{ id: 7, locked: 1, number: "42" }] });
        expect(result.data?.[0].customerName).toBeUndefined();
        expect(customerQueries()).toHaveLength(0);
    });

    it("works for an open invoice without a customer", async () => {
        databaseHas(invoiceRow(null, 0));

        expect(await invoice.getSingle(request({ page: "7" }))).toMatchObject({
            success: true,
            data: [{ id: 7, locked: 0 }]
        });
        expect(customerQueries()).toHaveLength(0);
    });

    it("gives a paid invoice the name its customer has now", async () => {
        databaseHas(invoiceRow(5, 1));

        const result = await invoice.getSingle(request({ page: "7" }));

        expect(result.data?.[0].customerName).toBe("Acme");
        expect(customerQueries()).toHaveLength(1);
        expect(customerQueries()[0].params).toEqual([5]);
    });
});

describe("customer.getSingle", () => {
    beforeEach(() => {
        databaseHas(invoiceRow(null, 0));
    });

    it("reads the customer in the path when it is asked for the customer itself", async () => {
        await customer.getSingle(request({ id: "9" }));

        expect(customerQueries()[0].params).toEqual(["9"]);
    });

    it("reads the customer it is given, not the one in the path", async () => {
        await customer.getSingle(request({ id: "9" }), 5);

        expect(customerQueries()[0].params).toEqual([5]);
    });

    it("finds no customer for an invoice that has none, and does not ask the database", async () => {
        // on /pdf/:id the id in the path is the invoice's, which is no customer's
        for (const params of [{}, { id: "9" }]) {
            expect(await customer.getSingle(request(params), null), JSON.stringify(params)).toEqual(
                {
                    success: true,
                    data: []
                }
            );
        }

        expect(queryMock).not.toHaveBeenCalled();
    });

    it("finds none when there is no id at all", async () => {
        expect(await customer.getSingle(request({}))).toEqual({ success: true, data: [] });
        expect(queryMock).not.toHaveBeenCalled();
    });
});
