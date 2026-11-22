// Picking a customer's worksheets for an invoice, without React (worksheetSelection.test.ts).
// A worksheet already on an invoice cannot be picked again.
import type { InvoiceIF, WorksheetIF } from '../../types';

export interface InvoiceItemIF {
    worksheetId: number;
    productId: number;
    quantity: number;
}

/** The worksheets of the page that can still be put on an invoice */
export const selectableIds = (rows: WorksheetIF[]): number[] =>
    rows.filter((row) => !row.invoice).map((row) => row.id);

/** One worksheet picked or put back */
export const toggled = (selected: number[], id: number): number[] =>
    selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];

/** Every selectable worksheet of the page is picked (and there is at least one) */
export const isAllSelected = (selectable: number[], selected: number[]): boolean =>
    selectable.length > 0 && selectable.every((id) => selected.includes(id));

/** The "all" box: picks every selectable worksheet, or none when they all were */
export const toggledAll = (selectable: number[], selected: number[]): number[] =>
    isAllSelected(selectable, selected) ? [] : selectable;

/** The invoice lines for the picked worksheets, with their product and quantity */
export const invoiceItems = (selected: number[], rows: WorksheetIF[]): InvoiceItemIF[] =>
    selected.map((worksheetId) => {
        const worksheet = rows.find((row) => row.id === worksheetId);

        return {
            worksheetId,
            productId: worksheet?.product_id || 0,
            quantity: worksheet?.quantity || 0,
        };
    });

/** The number of the invoice a worksheet is on, when it is one of the customer's */
export const invoiceNumberOf = (
    invoices: InvoiceIF[] | undefined,
    invoiceId: number | undefined
): string | undefined => invoices?.find((invoice) => invoice.id === invoiceId)?.number;
