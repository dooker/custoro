import { describe, expect, it } from 'vitest';
import { getInvoiceVatRate } from './invoiceVat';

describe('getInvoiceVatRate', () => {
    it('uses the rate stored on the invoice over the current setting', () => {
        expect(getInvoiceVatRate(22, 24)).toBe(22);
    });

    it('keeps a stored rate of 0', () => {
        expect(getInvoiceVatRate(0, 24)).toBe(0);
    });

    it('reads a stored rate sent as text', () => {
        expect(getInvoiceVatRate('22', '24')).toBe(22);
    });

    it.each([null, undefined, ''])(
        'falls back to the current setting when the invoice has %j',
        (value) => {
            expect(getInvoiceVatRate(value, '24')).toBe(24);
        }
    );

    it('returns 0 when neither rate is known', () => {
        expect(getInvoiceVatRate(undefined, undefined)).toBe(0);
    });
});
