import { describe, expect, it } from 'vitest';
import { invoiceReceiver, paidCopy } from './billedCustomer';

const live = { name: 'Asteroid Accounting SIA', vatNumber: 'LV00000000015' };

describe('paidCopy and invoiceReceiver', () => {
    it('show the customer as it is now on an open invoice', () => {
        const copy = paidCopy(false, { locked: 0, customerName: null, customerVatNumber: null });

        expect(copy).toBeNull();
        expect(invoiceReceiver(copy, live)).toEqual(live);
    });

    // Copilot review of PR 24: just after "Mark as paid" the draft is locked but the saved invoice
    // is still the open one, without a copy. The form showed "Unknown Customer" and charged VAT to a
    // foreign customer until the page was reloaded.
    it('keep the customer as it is now until the paid invoice is read again', () => {
        const copy = paidCopy(true, { locked: 0, customerName: null, customerVatNumber: null });

        expect(copy).toBeNull();
        expect(invoiceReceiver(copy, live)).toEqual(live);
    });

    it('show the copy of a paid invoice, not the customer as it is now', () => {
        const copy = paidCopy(true, {
            locked: 1,
            customerName: 'Asteroid Accounting SIA',
            customerVatNumber: 'LV00000000015',
        });

        expect(invoiceReceiver(copy, { name: 'Renamed', vatNumber: 'EE1' })).toEqual(live);
    });

    it('keep an empty field of the copy empty', () => {
        const copy = paidCopy(true, {
            locked: 1,
            customerName: undefined,
            customerVatNumber: null,
        });

        expect(invoiceReceiver(copy, live)).toEqual({ name: null, vatNumber: null });
    });
});
