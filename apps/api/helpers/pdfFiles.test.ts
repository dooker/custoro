import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    inlineContentDisposition,
    invoiceFilenamePrefixPattern,
    pdfCandidates,
    resolveInside,
    tenantPdfDir
} from "./pdfFiles";

describe("invoiceFilenamePrefixPattern", () => {
    it("accepts short names made of letters, digits, underscore and hyphen", () => {
        for (const prefix of ["", "invoice_", "Arve-", "INV2026_", "a".repeat(32)]) {
            expect(invoiceFilenamePrefixPattern.test(prefix), prefix).toBe(true);
        }
    });

    it("refuses paths, dots, spaces, line breaks and anything that is not plain ASCII", () => {
        for (const prefix of [
            "../",
            "../../x",
            "a/b",
            "a\\b",
            ".",
            "..",
            "invoice.",
            "inv oice",
            "invoice\n",
            "invoice\r\nX-Evil: 1",
            "arve_š",
            "arve_ö",
            "\0",
            "a".repeat(33)
        ]) {
            expect(invoiceFilenamePrefixPattern.test(prefix), JSON.stringify(prefix)).toBe(false);
        }
    });
});

describe("resolveInside", () => {
    const dir = path.join("/srv", "app", "storage", "pdf");

    it("resolves a plain file name inside the folder", () => {
        expect(resolveInside(dir, "invoice_25001.pdf")).toBe(path.join(dir, "invoice_25001.pdf"));
    });

    it("refuses anything that leaves the folder or is not a plain file name", () => {
        for (const name of [
            "../x.pdf",
            "../../etc/passwd",
            "..",
            ".",
            "",
            "sub/x.pdf",
            "/etc/passwd",
            "x.pdf\0.png"
        ]) {
            expect(resolveInside(dir, name), JSON.stringify(name)).toBeNull();
        }
    });
});

describe("inlineContentDisposition", () => {
    // Node refuses to set a header that is not latin1 or has a line break; this is what it does
    const accepted = (value: string) => /^[\t\x20-\x7e]*$/.test(value);

    it("keeps a plain name readable", () => {
        expect(inlineContentDisposition("invoice_25001.pdf")).toBe(
            `inline; filename="invoice_25001.pdf"; filename*=UTF-8''invoice_25001.pdf`
        );
    });

    it("carries a name with other characters as UTF-8 and an ASCII fallback", () => {
        const value = inlineContentDisposition("arve_š€.pdf");

        expect(value).toBe(
            `inline; filename="arve___.pdf"; filename*=UTF-8''arve_%C5%A1%E2%82%AC.pdf`
        );
        expect(accepted(value)).toBe(true);
    });

    it("never produces a value that can end the header or the quoted name", () => {
        for (const name of [
            'a"b.pdf',
            "a\r\nSet-Cookie: x=1.pdf",
            "a\nb.pdf",
            "a\\b.pdf",
            "a;b.pdf",
            "a%0d%0ab.pdf",
            "a'(b)*.pdf",
            "\uD800broken.pdf",
            "x\0y.pdf"
        ]) {
            const value = inlineContentDisposition(name);

            expect(accepted(value), JSON.stringify(name)).toBe(true);
            expect(value, JSON.stringify(name)).toMatch(
                /^inline; filename="[^"\\;%]*"; filename\*=UTF-8''[A-Za-z0-9._~!$&+^`|%-]*$/
            );
        }
    });
});

describe("tenantPdfDir and pdfCandidates", () => {
    it("keeps every company's PDFs in its own folder", () => {
        expect(tenantPdfDir("/data/pdf", 3)).toBe(path.join("/data/pdf", "3"));
    });

    it.each([0, -1, 1.5, Number.NaN])("refuses %s as a company id", (id) => {
        expect(() => tenantPdfDir("/data/pdf", id)).toThrow(/company id/);
    });

    it("finds company 1's PDFs in its folder, then where they were before companies", () => {
        expect(pdfCandidates("/data/pdf", 1, "invoice_7.pdf")).toEqual([
            path.join("/data/pdf", "1", "invoice_7.pdf"),
            path.join("/data/pdf", "invoice_7.pdf")
        ]);
    });

    it("never gives another company the old shared folder", () => {
        expect(pdfCandidates("/data/pdf", 2, "invoice_7.pdf")).toEqual([
            path.join("/data/pdf", "2", "invoice_7.pdf")
        ]);
    });

    it("gives nothing for a name that is a path", () => {
        expect(pdfCandidates("/data/pdf", 1, "other/invoice_7.pdf")).toEqual([]);
        expect(pdfCandidates("/data/pdf", 2, "../1/invoice_7.pdf")).toEqual([]);
    });
});
