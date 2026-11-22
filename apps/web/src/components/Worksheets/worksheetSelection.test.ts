import { describe, expect, it } from 'vitest';
import type { InvoiceIF, WorksheetIF } from '../../types';
import {
    invoiceItems,
    invoiceNumberOf,
    isAllSelected,
    selectableIds,
    toggled,
    toggledAll,
} from './worksheetSelection';

const rows: WorksheetIF[] = [
    { id: 1, product_id: 10, quantity: 2 },
    { id: 2, product_id: 11, quantity: 1.5, invoice: 77 },
    { id: 3, product_id: 12, quantity: 4 },
];

describe('selectableIds', () => {
    it('leaves out the worksheets already on an invoice', () => {
        expect(selectableIds(rows)).toEqual([1, 3]);
    });

    it('has none for an empty page or a page of invoiced worksheets', () => {
        expect(selectableIds([])).toEqual([]);
        expect(selectableIds([rows[1]])).toEqual([]);
    });
});

describe('toggled', () => {
    it('picks a worksheet and puts it back', () => {
        expect(toggled([], 1)).toEqual([1]);
        expect(toggled([1, 3], 1)).toEqual([3]);
        expect(toggled([1], 3)).toEqual([1, 3]);
    });
});

describe('isAllSelected', () => {
    it('is true only when every selectable worksheet is picked', () => {
        expect(isAllSelected([1, 3], [1, 3])).toBe(true);
        expect(isAllSelected([1, 3], [3, 1, 5])).toBe(true);
        expect(isAllSelected([1, 3], [1])).toBe(false);
    });

    it('is false when there is nothing to pick', () => {
        expect(isAllSelected([], [])).toBe(false);
    });
});

describe('toggledAll', () => {
    it('picks every selectable worksheet', () => {
        expect(toggledAll([1, 3], [])).toEqual([1, 3]);
        expect(toggledAll([1, 3], [3])).toEqual([1, 3]);
    });

    it('picks none when all were picked', () => {
        expect(toggledAll([1, 3], [1, 3])).toEqual([]);
    });
});

describe('invoiceItems', () => {
    it('gives each picked worksheet its product and quantity, in the order picked', () => {
        expect(invoiceItems([3, 1], rows)).toEqual([
            { worksheetId: 3, productId: 12, quantity: 4 },
            { worksheetId: 1, productId: 10, quantity: 2 },
        ]);
    });

    it('sends 0 for a worksheet no longer on the page', () => {
        expect(invoiceItems([99], rows)).toEqual([{ worksheetId: 99, productId: 0, quantity: 0 }]);
    });
});

describe('invoiceNumberOf', () => {
    const invoices = [{ id: 77, number: '26001' }] as InvoiceIF[];

    it('finds the number of the customer’s invoice', () => {
        expect(invoiceNumberOf(invoices, 77)).toBe('26001');
    });

    it('has none for another invoice, no invoice or no list yet', () => {
        expect(invoiceNumberOf(invoices, 78)).toBeUndefined();
        expect(invoiceNumberOf(invoices, undefined)).toBeUndefined();
        expect(invoiceNumberOf(undefined, 77)).toBeUndefined();
    });
});
