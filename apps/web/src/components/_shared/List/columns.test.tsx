import { describe, expect, it } from 'vitest';
import { customerColumns, customerHref } from '../../Customers/Customers';
import { productColumns, productHref } from '../../Products/Products';
import { invoiceColumns, invoiceHref } from '../../Invoices/Invoices';
import { worksheetCustomerColumns, worksheetCustomerHref } from '../../Worksheets/Worksheets';
import {
    customerWorksheetColumns,
    customerWorksheetHref,
    invoicedRow,
} from '../../Worksheets/WorksheetsPerCustomer';
import type { InvoiceWithCustomerIF, ProductIF, WorksheetIF } from '../../../types';
import type { CustomerIF } from '../../../types/customer';
import type { ColumnIF } from './listLogic';

// What each list shows and where its rows lead: the parts of a list page that are its own (the
// rest is ListPage). The same columns are used by the small lists on Home and the customer page.
const keys = <T,>(columns: ColumnIF<T>[]) => columns.map(({ key }) => key);

const invoice = (locked: number) =>
    ({ id: 5, number: '26001', name: 'Orbit', total: 2, locked }) as InvoiceWithCustomerIF;

describe('customers', () => {
    it('shows the contact person after the name, when there is one', () => {
        const name = customerColumns.find(({ key }) => key === 'name');

        expect(name?.render?.({ id: 1, name: 'Orbit', contact: 'Mari' } as CustomerIF)).toBe(
            'Orbit (Mari)'
        );
        expect(name?.render?.({ id: 1, name: 'Orbit' } as CustomerIF)).toBe('Orbit');
    });

    it('translates every column head (the Name head was English)', () => {
        expect(customerColumns.map(({ label }) => label)).toEqual(['#', 'customers.form.name']);
    });

    it('leads to the customer on the same page of the list', () => {
        expect(customerHref({ id: 7 } as CustomerIF, 3)).toBe('/customer/3/7/');
        expect(customerHref({ id: 7 } as CustomerIF)).toBe('/customer/1/7/');
    });
});

describe('products', () => {
    it('shows "My price" only to people who see discount prices', () => {
        expect(keys(productColumns(true))).toEqual([
            'code',
            'name',
            'price',
            'discountPrice',
            'unit',
        ]);
        expect(keys(productColumns(false))).toEqual(['code', 'name', 'price', 'unit']);
    });

    it('shows prices with two decimals', () => {
        const [, , price, discount] = productColumns(true);
        const product = { id: 1, price: 19.9, discountPrice: 15 } as ProductIF;

        expect(price.render?.(product)).toBe('19.90');
        expect(discount.render?.(product)).toBe('15.00');
    });

    it('leads to the product', () => {
        expect(productHref({ id: 4 } as ProductIF, 2)).toBe('/product/2/4/');
    });
});

describe('invoices', () => {
    it('adds the lock column only when a row is paid', () => {
        expect(keys(invoiceColumns()([invoice(0)]))).toEqual(['number', 'name', 'total']);
        expect(keys(invoiceColumns()([invoice(0), invoice(1)]))).toEqual([
            'locked',
            'number',
            'name',
            'total',
        ]);
    });

    it('leaves out the customer on the customer’s own page', () => {
        expect(keys(invoiceColumns(false)([invoice(0)]))).toEqual(['number', 'total']);
    });

    it('draws the lock only on a paid row', () => {
        const [lock] = invoiceColumns()([invoice(1)]);

        expect(lock.render?.(invoice(1))).not.toBeNull();
        expect(lock.render?.(invoice(0))).toBeNull();
    });

    it('leads to the invoice', () => {
        expect(invoiceHref(invoice(0), 6)).toBe('/invoice/6/5/');
    });
});

describe('worksheets', () => {
    it('lists customers with their number of worksheets, a row leading to theirs', () => {
        expect(keys(worksheetCustomerColumns)).toEqual(['name', 'worksheet_count']);
        expect(worksheetCustomerHref({ id: 12 } as WorksheetIF, 2)).toBe('/worksheets/2/12/1/');
    });

    it('shows a customer’s worksheets with the discount price only when asked', () => {
        expect(keys(customerWorksheetColumns(true))).toEqual([
            'code',
            'name',
            'price',
            'discountPrice',
            'quantity',
        ]);
        expect(keys(customerWorksheetColumns(false))).toEqual([
            'code',
            'name',
            'price',
            'quantity',
        ]);
    });

    it('opens a worksheet that is not on an invoice, keeping both pages', () => {
        expect(customerWorksheetHref({ id: 30 } as WorksheetIF, 12, 2, 3)).toBe(
            '/worksheet/2/12/3/30/'
        );
    });

    it('does not open a worksheet already on an invoice, and greys its row', () => {
        const invoiced = { id: 31, invoice: 77 } as WorksheetIF;

        expect(customerWorksheetHref(invoiced, 12)).toBeUndefined();
        expect(invoicedRow(invoiced)).toMatch(/^disabled/);
        expect(invoicedRow({ id: 30 } as WorksheetIF)).toBe('');
    });
});
