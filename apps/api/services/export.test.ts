import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";

// The export reads the invoices and their lines in one statement, so both come from one
// snapshot: an invoice moved out of the period between two reads cannot show up without lines
const queryMock = vi.fn();

vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("../helper/query", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../helper/query")>()),
    query: queryMock
}));

const { getInvoicesCsv } = await import("./export");

const request = {
    database: "shop",
    query: { from: "2026-10-01", to: "2026-10-31", language: "en" }
} as unknown as Request;

const invoice = (id: number, number: string) => ({
    id,
    number,
    invoiceDate: "2026-10-05 00:00:00",
    customerName: `Customer ${id}`,
    regNumber: "",
    vatNumber: "",
    paymentPeriod: 14,
    vat: 24,
    locked: 0,
    sentDate: null
});

beforeEach(() => {
    queryMock.mockReset();
});

describe("GET /export/invoices", () => {
    it("reads invoices and lines in one statement and adds up each invoice's lines", async () => {
        queryMock.mockResolvedValue({
            success: true,
            data: [
                { ...invoice(1, "1001"), linePrice: 33.33, lineQuantity: 1.5 },
                { ...invoice(1, "1001"), linePrice: 33.33, lineQuantity: 1.5 },
                { ...invoice(2, "1002"), linePrice: null, lineQuantity: null }
            ]
        });

        const result = await getInvoicesCsv(request);

        expect(queryMock).toHaveBeenCalledOnce();
        expect(queryMock.mock.calls[0][0].sql).toMatch(/LEFT JOIN invoice_items/);
        expect(queryMock.mock.calls[0][0].params).toEqual(["2026-10-01", "2026-11-01"]);

        const lines = (result.success ? result.csv : "").trimEnd().split("\r\n").slice(1);

        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain(";100,00;24;24,00;124,00;");
        // An invoice without lines is still listed, at zero
        expect(lines[1]).toContain("1002;");
        expect(lines[1]).toContain(";0,00;24;0,00;0,00;");
    });

    it("answers error when the read fails", async () => {
        queryMock.mockResolvedValue({ success: false, message: "error" });

        expect(await getInvoicesCsv(request)).toEqual({ success: false, message: "error" });
    });
});
