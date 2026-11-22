import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import ListTable from './ListTable';
import { invoiceColumns, invoiceHref } from '../../Invoices/Invoices';
import type { InvoiceWithCustomerIF } from '../../../types';

const invoice = (id: number, locked: number) =>
    ({ id, number: `2600${id}`, name: 'Orbit', total: 2, locked }) as InvoiceWithCustomerIF;

const table = (rows: InvoiceWithCustomerIF[]) =>
    render(
        <MemoryRouter>
            <ListTable<InvoiceWithCustomerIF>
                columns={invoiceColumns()(rows)}
                rows={rows}
                rowKey={(row) => row.id}
                rowHref={(row) => invoiceHref(row)}
            />
        </MemoryRouter>
    );

// The one link of a row that Tab reaches
const tabStops = () =>
    screen.getAllByRole('link').filter((link) => link.getAttribute('tabindex') === '0');

describe('ListTable', () => {
    // Copilot review of PR 46: with a paid invoice in the list the lock column comes first, so
    // Tab reached an empty link (or an unnamed lock icon) and never the invoice number
    it('puts the tab stop of a row on its first named column, not the lock', () => {
        table([invoice(1, 1), invoice(2, 0)]);

        expect(tabStops().map((link) => link.textContent)).toEqual(['26001', '26002']);
    });

    it('puts it on the first column when every column is named', () => {
        table([invoice(2, 0)]);

        expect(tabStops().map((link) => link.textContent)).toEqual(['26002']);
    });
});
