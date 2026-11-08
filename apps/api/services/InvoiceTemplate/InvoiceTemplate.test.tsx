import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import InvoiceTemplate from "./InvoiceTemplate";
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
} as unknown as InvoiceTemplateProps;

const render = () =>
    renderToBuffer(
        <Document>
            <Page>
                <InvoiceTemplate {...props} />
            </Page>
        </Document>
    );

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
