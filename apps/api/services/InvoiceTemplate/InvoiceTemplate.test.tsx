import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import InvoiceTemplate from "./InvoiceTemplate";
import i18n from "../../i18n";
import { pdfTranslator } from "../pdf";
import type { InvoiceTemplateProps } from "../../types/pdf";

const props = {
    invoice: {
        id: 1,
        number: 1001,
        customerId: 1,
        invoiceDate: "2026-11-08T10:00:00.000Z",
        invoiceType: "invoice",
        vat: 24,
        items: [
            {
                code: "H",
                name: "Töö: õunapuu, šokolaad, žürii",
                unit: "h",
                quantity: 1.5,
                price: "33.33"
            }
        ]
    },
    customer: { name: "Õnne OÜ", paymentPeriod: 14, address: "Pärnu mnt 1, Tallinn" },
    settings: { companyName: "Custoro Test OÜ", companyRegNr: "12345678" }
} as unknown as Omit<InvoiceTemplateProps, "t">;

const render = async () =>
    renderToBuffer(
        <Document>
            <Page>
                <InvoiceTemplate {...props} t={await pdfTranslator("en")} />
            </Page>
        </Document>
    );

/** The text the template prints, without making a PDF (the PDF stores glyph numbers, not text) */
const printed = (node: React.ReactNode): string[] => {
    if (typeof node === "string" || typeof node === "number") {
        return [String(node)];
    }

    if (Array.isArray(node)) {
        return node.flatMap(printed);
    }

    if (!React.isValidElement(node)) {
        return [];
    }

    const { type, props: elementProps } = node as React.ReactElement<{
        children?: React.ReactNode;
    }>;

    // The template's own parts are plain functions without hooks: call them
    if (typeof type === "function") {
        return printed((type as (p: unknown) => React.ReactNode)(elementProps));
    }

    return printed(elementProps.children);
};

describe("invoice PDF fonts", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("renders with no network: the fonts come from the image, not from Google", async () => {
        // react-pdf loads its layout engine from a data: URL, which needs no network
        const realFetch = globalThis.fetch;
        const network: string[] = [];
        vi.stubGlobal("fetch", async (...args: Parameters<typeof fetch>) => {
            const [input, init] = args;
            const url = input instanceof Request ? input.url : String(input);

            if (url.startsWith("data:")) {
                return realFetch(input, init);
            }

            network.push(url);
            throw new Error("no network");
        });

        const pdf = await render();

        expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
        expect(network).toEqual([]);
        // Both weights are embedded (as subsets, so the name has a prefix such as ABCDEF+)
        expect(pdf.toString("latin1")).toMatch(/\/BaseFont \/[A-Z]{6}\+Roboto-Regular/);
        expect(pdf.toString("latin1")).toMatch(/\/BaseFont \/[A-Z]{6}\+Roboto-Bold/);
    });
});

describe("invoice PDF language", () => {
    it("prints the language asked for, whatever the shared i18n instance is set to", async () => {
        await i18n.changeLanguage("en");

        const estonian = printed(<InvoiceTemplate {...props} t={await pdfTranslator("et")} />);
        // Meanwhile another request switches the shared instance
        await i18n.changeLanguage("en");
        const english = printed(<InvoiceTemplate {...props} t={await pdfTranslator("en")} />);

        expect(estonian).toContain("Klient");
        expect(estonian).toContain("Tasuda (EUR)");
        expect(estonian).not.toContain("Client");
        expect(english).toContain("Client");
        expect(english).toContain("To pay (EUR)");
    });

    it("prints English for a language it does not know", async () => {
        const text = printed(<InvoiceTemplate {...props} t={await pdfTranslator("de")} />);

        expect(text).toContain("Client");
    });

    it("prints the totals with the cents rule", async () => {
        const text = printed(<InvoiceTemplate {...props} t={await pdfTranslator("en")} />);

        // 1.5 x 33.33 = 49.995: the line, the net and the VAT of 24 %
        expect(text).toEqual(expect.arrayContaining(["50.00", "12.00", "62.00", "33.33"]));
    });
});
