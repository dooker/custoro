import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AxiosResponse } from 'axios';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Axios } from '../../Axios';
import '../../test/renderScreen';
import { RESOURCE } from '../../variables';
import type { InvoiceIF } from '../../types';
import { Actions } from './Actions';

vi.mock('../../Axios', () => ({ Axios: { post: vi.fn(), put: vi.fn() } }));

const invoice = {
    id: 5,
    hash: 'abc',
    customerId: 1,
    locked: 0,
    sentDate: null,
} as unknown as InvoiceIF;
const key = [RESOURCE.INVOICE, '5'];

// The invoice page shows the invoice from the query cache, so that is where the date must be
const open = (client: QueryClient) =>
    render(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <Actions markAsPaid={vi.fn()} draft={client.getQueryData<InvoiceIF>(key) ?? null} />
            </MemoryRouter>
        </QueryClientProvider>
    );

beforeEach(() => {
    vi.resetAllMocks();
});

describe('sending an invoice', () => {
    it('shows when it was emailed, also after leaving the invoice and coming back', async () => {
        const client = new QueryClient();

        client.setQueryData(key, invoice);
        vi.mocked(Axios.post).mockResolvedValue({
            data: { success: true, sentDate: '2026-11-08T07:30:00.000Z' },
        } as AxiosResponse);

        const page = open(client);

        expect(screen.queryByTestId('invoice-sent')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Send email' }));

        expect(await screen.findByTestId('invoice-sent')).toHaveTextContent('Emailed 08/11/2026');
        expect(client.getQueryData<InvoiceIF>(key)?.sentDate).toBe('2026-11-08T07:30:00.000Z');

        // Away and back: the page opens the invoice from the cache again
        page.unmount();
        open(client);

        expect(screen.getByTestId('invoice-sent')).toHaveTextContent('Emailed 08/11/2026');
    });

    it('keeps the old date when the email was not sent', async () => {
        const client = new QueryClient();

        client.setQueryData(key, { ...invoice, sentDate: '2026-10-01T10:00:00.000Z' });
        vi.mocked(Axios.post).mockResolvedValue({
            data: { success: false, message: 'missingInfo' },
        } as AxiosResponse);
        open(client);

        fireEvent.click(screen.getByRole('button', { name: 'Send email' }));

        await vi.waitFor(() => expect(Axios.post).toHaveBeenCalled());
        expect(screen.getByTestId('invoice-sent')).toHaveTextContent('Emailed 01/10/2026');
        expect(client.getQueryData<InvoiceIF>(key)?.sentDate).toBe('2026-10-01T10:00:00.000Z');
    });
});
