// Picking a customer's worksheets for an invoice, without React (worksheetSelection.test.ts).
// A worksheet already on an invoice cannot be picked again.
import type { InvoiceIF, WorksheetIF } from '../../types';

export interface InvoiceItemIF {
    worksheetId: number;
    productId: number;
    quantity: number;
}

/** The worksheets of the page that can still be put on an invoice */
const selectableRows = (rows: WorksheetIF[]): WorksheetIF[] => rows.filter((row) => !row.invoice);

export const selectableIds = (rows: WorksheetIF[]): number[] =>
    selectableRows(rows).map((row) => row.id);

/**
 * A picked worksheet, as its invoice line: it keeps its product and quantity, so a pick on a row
 * no longer on screen (another page, a smaller window) still goes on the invoice whole
 */
export const pickOf = ({ id, product_id, quantity }: WorksheetIF): InvoiceItemIF => ({
    worksheetId: id,
    productId: product_id || 0,
    quantity: quantity || 0,
});

/** The ids of the picked worksheets */
export const pickedIds = (picked: InvoiceItemIF[]): number[] =>
    picked.map(({ worksheetId }) => worksheetId);

/** One worksheet picked or put back */
export const toggled = (picked: InvoiceItemIF[], row: WorksheetIF): InvoiceItemIF[] =>
    picked.some(({ worksheetId }) => worksheetId === row.id)
        ? picked.filter(({ worksheetId }) => worksheetId !== row.id)
        : [...picked, pickOf(row)];

/** Every selectable worksheet of the page is picked (and there is at least one) */
export const isAllSelected = (selectable: number[], selected: number[]): boolean =>
    selectable.length > 0 && selectable.every((id) => selected.includes(id));

/**
 * The "all" box: picks every selectable worksheet of the page, or puts them all back when they all
 * were; picks on other pages stay
 */
export const toggledAll = (rows: WorksheetIF[], picked: InvoiceItemIF[]): InvoiceItemIF[] => {
    const page = selectableRows(rows);
    const pageIds = page.map(({ id }) => id);
    const others = picked.filter(({ worksheetId }) => !pageIds.includes(worksheetId));

    return isAllSelected(pageIds, pickedIds(picked)) ? others : [...others, ...page.map(pickOf)];
};

/** The number of the invoice a worksheet is on, when it is one of the customer's */
export const invoiceNumberOf = (
    invoices: InvoiceIF[] | undefined,
    invoiceId: number | undefined
): string | undefined => invoices?.find((invoice) => invoice.id === invoiceId)?.number;
