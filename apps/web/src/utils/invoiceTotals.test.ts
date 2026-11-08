import { describe, expect, it } from 'vitest';
// One list of cases for the API and the web app, so the PDF and the screen always agree
import shared from '../../../api/helpers/invoiceTotals.cases.json';
import { formatCents, formatPrice, invoiceTotals } from './invoiceTotals';

describe('invoiceTotals', () => {
    it.each(shared.totals)('$note', ({ items, vat, noVat, lines, net, vatAmount, total }) => {
        const totals = invoiceTotals(items, vat, noVat ?? false);

        expect(totals.lines.map(formatCents)).toEqual(lines);
        expect(formatCents(totals.net)).toBe(net);
        expect(formatCents(totals.vat)).toBe(vatAmount);
        expect(formatCents(totals.total)).toBe(total);
    });
});

describe('formatPrice', () => {
    it.each(shared.prices)('$price is printed $printed', ({ price, printed }) => {
        expect(formatPrice(price)).toBe(printed);
    });
});
