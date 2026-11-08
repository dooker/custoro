import { describe, expect, it } from "vitest";
import { formatCents, formatPrice, invoiceTotals, lineCents } from "./invoiceTotals";
import shared from "./invoiceTotals.cases.json";

describe("invoiceTotals", () => {
    it.each(shared.totals)("$note", ({ items, vat, noVat, lines, net, vatAmount, total }) => {
        const totals = invoiceTotals(items, vat, noVat ?? false);

        expect(totals.lines.map(formatCents)).toEqual(lines);
        expect(formatCents(totals.net)).toBe(net);
        expect(formatCents(totals.vat)).toBe(vatAmount);
        expect(formatCents(totals.total)).toBe(total);
    });

    it("always adds up: the printed lines are the net, net plus VAT is the total", () => {
        for (let cents = 100; cents <= 10000; cents += 7) {
            for (let tenths = 1; tenths <= 30; tenths++) {
                const items = [
                    { price: cents / 100, quantity: tenths / 10 },
                    { price: 33.33, quantity: 1.5 }
                ];
                const totals = invoiceTotals(items, 24);

                expect(totals.lines.reduce((sum, line) => sum + line, 0)).toBe(totals.net);
                expect(totals.net + totals.vat).toBe(totals.total);
            }
        }
    });

    it("treats a missing list as no lines", () => {
        expect(invoiceTotals(undefined, 24)).toEqual({ lines: [], net: 0, vat: 0, total: 0 });
    });

    it("rounds each line to cents", () => {
        expect(lineCents({ price: 0.005, quantity: 1 })).toBe(1);
        expect(lineCents({ price: 0.0049, quantity: 1 })).toBe(0);
    });
});

describe("formatPrice", () => {
    it.each(shared.prices)("$price is printed $printed", ({ price, printed }) => {
        expect(formatPrice(price)).toBe(printed);
    });
});

describe("formatCents", () => {
    it("prints cents as an amount", () => {
        expect(formatCents(12345)).toBe("123.45");
        expect(formatCents(-5)).toBe("-0.05");
        expect(formatCents(0)).toBe("0.00");
        expect(formatCents(-0)).toBe("0.00");
    });
});
