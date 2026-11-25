import { describe, expect, it } from 'vitest';
import type { InvoiceIF, WorksheetIF } from '../../types';
import {
    invoiceNumberOf,
    isAllSelected,
    pickedIds,
    pickOf,
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

// The invoice lines of rows 1 and 3, and of a worksheet on another page
const one = { worksheetId: 1, productId: 10, quantity: 2 };
const three = { worksheetId: 3, productId: 12, quantity: 4 };
const elsewhere = { worksheetId: 99, productId: 50, quantity: 1 };

describe('pickOf', () => {
    it('keeps the worksheet’s product and quantity for its invoice line', () => {
        expect(pickOf(rows[2])).toEqual(three);
    });

    it('sends 0 for a missing product or quantity', () => {
        expect(pickOf({ id: 5 })).toEqual({ worksheetId: 5, productId: 0, quantity: 0 });
    });
});

describe('toggled', () => {
    it('picks a worksheet and puts it back, in the order picked', () => {
        expect(toggled([], rows[0])).toEqual([one]);
        expect(toggled([one, three], rows[0])).toEqual([three]);
        expect(toggled([three], rows[0])).toEqual([three, one]);
        expect(pickedIds([three, one])).toEqual([3, 1]);
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
    it('picks every selectable worksheet of the page', () => {
        expect(toggledAll(rows, [])).toEqual([one, three]);
        expect(toggledAll(rows, [three])).toEqual([one, three]);
    });

    it('puts them back when all were picked', () => {
        expect(toggledAll(rows, [one, three])).toEqual([]);
    });

    // Copilot review of PR 47, round 2: a pick on a row no longer on screen keeps its invoice line
    it('keeps the picks of other pages', () => {
        expect(toggledAll(rows, [elsewhere])).toEqual([elsewhere, one, three]);
        expect(toggledAll(rows, [one, elsewhere, three])).toEqual([elsewhere]);
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
