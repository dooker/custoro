import { describe, expect, it } from "vitest";
import { invoicesCsv, parseExportRange, type ExportInvoiceRow } from "./invoiceExport";

describe("parseExportRange", () => {
    it("takes a period of days, both included, and gives the day after the last", () => {
        expect(parseExportRange("2026-10-01", "2026-10-31")).toEqual({
            ok: true,
            from: "2026-10-01",
            to: "2026-10-31",
            before: "2026-11-01"
        });
        expect(parseExportRange("2026-12-31", "2026-12-31")).toMatchObject({
            before: "2027-01-01"
        });
    });

    it.each([
        ["2026-10-31", "2026-10-01", "the end before the start"],
        ["2026-02-30", "2026-03-01", "a day that does not exist"],
        ["1.10.2026", "31.10.2026", "another format"],
        [undefined, "2026-10-31", "a missing day"],
        [["2026-10-01"], "2026-10-31", "a list"],
        ["2026-10-01' OR 1=1 --", "2026-10-31", "SQL"]
    ])("refuses %s .. %s (%s)", (from, to) => {
        expect(parseExportRange(from, to)).toEqual({ ok: false, message: "invalidInput" });
    });

    it("allows a whole year, also a leap year, and refuses longer", () => {
        expect(parseExportRange("2028-01-01", "2028-12-31").ok).toBe(true);
        expect(parseExportRange("2026-01-01", "2027-01-01").ok).toBe(true);
        expect(parseExportRange("2026-01-01", "2027-01-02")).toEqual({
            ok: false,
            message: "export.rangeTooLong"
        });
    });
});

const row = (parts: Partial<ExportInvoiceRow>): ExportInvoiceRow => ({
    id: 1,
    number: "1001",
    invoiceDate: "2026-10-05 00:00:00",
    customerName: "Õnne OÜ",
    regNumber: "12345678",
    vatNumber: "EE100000001",
    paymentPeriod: 14,
    vat: 24,
    locked: 0,
    sentDate: null,
    ...parts
});

const headings = { yes: "yes", no: "no" };
const cells = (csv: string) =>
    csv
        .replace(/^\uFEFF/, "")
        .trimEnd()
        .split("\r\n")
        .map((line) => line.split(";"));

describe("invoicesCsv", () => {
    it("writes one line per invoice with the totals of its PDF, decimal comma", () => {
        const lines = new Map([
            [
                1,
                [
                    { price: 33.33, quantity: 1.5 },
                    { price: 33.33, quantity: 1.5 }
                ]
            ]
        ]);
        const csv = invoicesCsv([row({ locked: 1, sentDate: "2026-10-06 09:30:00" })], lines, {
            ...headings,
            number: "Number"
        });

        expect(csv.startsWith("\uFEFFNumber;date;due;customer;")).toBe(true);
        expect(cells(csv)[1]).toEqual([
            "1001",
            "2026-10-05",
            "2026-10-19",
            "Õnne OÜ",
            "12345678",
            "EE100000001",
            "100,00",
            "24",
            "24,00",
            "124,00",
            "yes",
            "2026-10-06"
        ]);
    });

    it("leaves out the VAT for a foreign VAT number, as the PDF does", () => {
        const lines = new Map([[1, [{ price: 100, quantity: 1 }]]]);
        const [, line] = cells(invoicesCsv([row({ vatNumber: "DE123456789" })], lines, headings));

        expect(line.slice(6, 11)).toEqual(["100,00", "0", "0,00", "100,00", "no"]);
    });

    it("writes an invoice without lines as zero", () => {
        const [, line] = cells(invoicesCsv([row({})], new Map(), headings));

        expect(line.slice(6, 10)).toEqual(["0,00", "24", "0,00", "0,00"]);
    });

    it("keeps a customer name from running as a spreadsheet formula", () => {
        const csv = invoicesCsv(
            [row({ customerName: '=HYPERLINK("http://x","y")' }), row({ customerName: "-1+2" })],
            new Map(),
            headings
        );

        expect(csv).toContain(`"'=HYPERLINK(""http://x"",""y"")"`);
        expect(csv).toContain(";'-1+2;");
    });

    it("quotes text with a semicolon, a quote or a line break", () => {
        const csv = invoicesCsv([row({ customerName: 'A; "B"\nC' })], new Map(), headings);

        expect(csv).toContain(`;"A; ""B""\nC";`);
    });
});
