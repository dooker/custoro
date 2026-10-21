import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";

// Defense in depth: the statements built from names and ids use placeholders and explicit column
// lists, and a config lookup gets each row under the name it asked for
const queryMock = vi.fn();

vi.mock("../db", () => ({ getPool: () => ({}) }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("../helper/query", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../helper/query")>()),
    query: queryMock
}));

const helpers = await import("./_helpers");
const worksheet = await import("./worksheet");
const profile = await import("./profile");

const request = (parts: { params?: object; user?: object }) =>
    ({ database: "shop", params: {}, query: {}, body: {}, ...parts }) as unknown as Request;

const sqlCalls = () => queryMock.mock.calls.map(([call]) => call);

beforeEach(() => {
    queryMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("getConfig", () => {
    // MySQL answers in the order of the unique key on config.name, which is not the order asked
    const rows = [
        { name: "forgotHtml", value: "", longValue: "<p>html</p>" },
        { name: "forgotSubject", value: "the subject", longValue: "" },
        { name: "forgotText", value: "", longValue: "the text" }
    ];

    it("asks for the names with placeholders, never with the names in the SQL", async () => {
        queryMock.mockResolvedValue({ success: true, data: [] });

        await helpers.getConfig({
            database: "shop",
            fields: ["forgotSubject", "x') OR ('1'='1"],
            mapper: ["subject", "text"]
        });

        const [{ sql, params }] = sqlCalls();

        expect(sql).toContain("WHERE name IN (?, ?)");
        expect(sql).not.toContain("forgotSubject");
        expect(sql).not.toContain("OR ('1'='1");
        expect(params).toEqual(["forgotSubject", "x') OR ('1'='1"]);
    });

    it("reads every setting when no names are given", async () => {
        queryMock.mockResolvedValue({ success: true, data: [] });

        await helpers.getConfig({
            database: "shop",
            fields: undefined as unknown as string[],
            mapper: []
        });

        const [{ sql, params }] = sqlCalls();

        expect(sql).not.toContain("WHERE");
        expect(params).toEqual([]);
    });

    it("gives each row the name it asked for, whatever order the database answers in", async () => {
        queryMock.mockResolvedValue({ success: true, data: rows });

        // Rows by position gave the HTML as the subject, the subject as the text and the text as the HTML
        expect(
            await helpers.getConfig({
                database: "shop",
                fields: ["forgotSubject", "forgotText", "forgotHtml"],
                mapper: ["subject", "text", "html"]
            })
        ).toEqual({
            success: true,
            data: { subject: "the subject", text: "the text", html: "<p>html</p>" }
        });
    });

    it("leaves out names that are not email settings, also when they have no mapping", async () => {
        queryMock.mockResolvedValue({
            success: true,
            data: [
                { name: "vat", value: "24", longValue: "" },
                { name: "invoiceSubject", value: "kept", longValue: "" }
            ]
        });

        expect(
            await helpers.getConfig({
                database: "shop",
                fields: ["invoiceSubject", "vat"],
                mapper: ["subject"]
            })
        ).toEqual({ success: true, data: { subject: "kept" } });
    });

    it("answers success: false when the query fails", async () => {
        queryMock.mockResolvedValue({ success: false, data: [] });

        expect(await helpers.getConfig({ database: "shop", fields: ["a"], mapper: ["b"] })).toEqual(
            { success: false, message: "get.config" }
        );
    });
});

describe("explicit column lists", () => {
    const invoiceRow = {
        id: 7,
        number: "42",
        customer_id: 5,
        create_date: "2026-10-01T00:00:00.000Z",
        change_date: "2026-10-01T00:00:00.000Z",
        invoice_date: "2026-10-01T00:00:00.000Z",
        payment_type: "cash",
        invoice_type: "invoice",
        locked: 0,
        vat: 24,
        sent_date: null,
        hash: null,
        filename: null,
        payment_period: 14
    };

    it("get one invoice by its id, with the columns the web app and the PDF read", async () => {
        queryMock.mockImplementation(async ({ sql }: { sql: string }) =>
            /FROM invoices/.test(sql)
                ? { success: true, data: [invoiceRow] }
                : { success: true, data: [{ id: 1, quantity: 2 }] }
        );

        const result = await helpers.getInvoice(request({ params: { page: "7" } }));
        const [invoiceQuery, itemsQuery] = sqlCalls();

        expect(invoiceQuery.sql).not.toMatch(/SELECT\s+\*/);
        expect(invoiceQuery.sql).toMatch(/WHERE id = \?/);
        expect(invoiceQuery.sql).not.toContain("number_sort");
        expect(invoiceQuery.params).toEqual(["7"]);
        // the items belong to the invoice that was found, whatever the request said
        expect(itemsQuery.params).toEqual([7]);

        expect(result.data?.[0]).toMatchObject({
            id: 7,
            number: "42",
            customerId: 5,
            invoiceDate: "2026-10-01",
            paymentType: "cash",
            invoiceType: "invoice",
            locked: 0,
            vat: 24,
            paymentPeriod: 14,
            items: [{ id: 1, quantity: 2 }]
        });
        expect(result.data?.[0]).not.toHaveProperty("numberSort");
    });

    it("get one worksheet", async () => {
        queryMock.mockResolvedValue({ success: true, data: [] });

        await worksheet.getSingle(request({ params: { id: "9" } }));

        const [{ sql }] = sqlCalls();

        expect(sql).not.toMatch(/SELECT\s+\*/);

        for (const column of [
            "id",
            "product_id",
            "customer_id",
            "order_id",
            "quantity",
            "invoice",
            "locked"
        ]) {
            expect(sql, column).toMatch(new RegExp(`\\b${column}\\b`));
        }
    });
});

describe("the profile's last seen time", () => {
    it("is only written when it is more than 5 minutes old", async () => {
        queryMock.mockResolvedValue({ success: true, data: [{ id: 2 }] });

        await profile.getSingle(request({ user: { id: 2, role: "user", tv: 0 } }));

        const update = sqlCalls().find(({ sql }) => /UPDATE users/.test(sql));

        expect(update.sql).toMatch(/timestamp < NOW\(\) - INTERVAL 5 MINUTE/);
        expect(update.params).toEqual([2]);
    });
});
