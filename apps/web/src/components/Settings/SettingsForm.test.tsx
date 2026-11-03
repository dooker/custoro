import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Axios } from '../../Axios';
import { useNotification } from '../../store/notification';
import { renderScreen } from '../../test/renderScreen';
import type { SettingsIF } from '../../types';
import { endpoint, PATHS } from '../../variables';
import { SettingsForm } from './SettingsForm';

vi.mock('../../Axios', () => ({ Axios: { put: vi.fn() } }));

// What the API answered when the page was opened; the counter is as it was then
const loaded = {
    vat: '24',
    lastInvoiceId: '25003',
    invoiceFilenamePrefix: 'invoice_',
    companyName: 'Quantum Desk Co.',
    logo: 'logo.png',
    invoiceHtml: '<p>Hello</p>',
} as unknown as SettingsIF;

const answer = (data: unknown) => vi.mocked(Axios.put).mockResolvedValue({ data } as AxiosResponse);

const renderForm = () =>
    renderScreen(
        <SettingsForm
            initialData={loaded}
            type="settings"
            activeTab="general"
            setActiveTab={vi.fn()}
        />,
        { path: PATHS.SETTINGS }
    );

const edit = async (label: string, value: string) =>
    fireEvent.change(await screen.findByLabelText(label), { target: { value } });

// The body of the n-th save (0 is the first)
const sent = (call = 0) => vi.mocked(Axios.put).mock.calls[call][1];

beforeEach(() => {
    vi.resetAllMocks();
    useNotification.setState({ show: false, error: false, message: '' });
    answer({ success: true });
});

describe('SettingsForm autosave', () => {
    it('sends only the setting that was edited', async () => {
        renderForm();

        await edit('VAT', '23');

        await waitFor(() => expect(Axios.put).toHaveBeenCalledTimes(1));
        expect(vi.mocked(Axios.put).mock.calls[0][0]).toBe(`${endpoint}${PATHS.SETTINGS}`);
        expect(sent()).toEqual({ vat: '23' });
    });

    it('does not write the invoice counter back unless it was edited', async () => {
        renderForm();

        await edit('Invoice Filename Prefix', 'INV');
        await waitFor(() => expect(Axios.put).toHaveBeenCalledTimes(1));
        expect(sent()).not.toHaveProperty('lastInvoiceId');

        await edit('Last Invoice ID', '30000');
        await waitFor(() => expect(Axios.put).toHaveBeenCalledTimes(2));
        expect(sent(1)).toEqual({ lastInvoiceId: '30000' });
    });

    it('sends nothing when a tab is opened and nothing changed', async () => {
        renderForm();

        fireEvent.click(await screen.findByRole('button', { name: 'Pdf settings' }));

        await waitFor(() => expect(screen.getByTestId('path')).toBeInTheDocument());
        expect(Axios.put).not.toHaveBeenCalled();
    });

    it('does not send a change again once the API took it', async () => {
        renderForm();

        await edit('VAT', '23');
        await waitFor(() => expect(Axios.put).toHaveBeenCalledTimes(1));
        // Let the answer arrive before the next edit
        await waitFor(() => expect(useNotification.getState().error).toBe(false));
        await new Promise((resolve) => setTimeout(resolve, 50));

        await edit('Invoice Filename Prefix', 'INV');
        await waitFor(() => expect(Axios.put).toHaveBeenCalledTimes(2));
        expect(sent(1)).toEqual({ invoiceFilenamePrefix: 'INV' });
    });

    it('says so when the API refuses an autosave', async () => {
        answer({ success: false, message: 'settingsInvalid' });
        renderForm();

        await edit('VAT', '2300');

        await waitFor(() => expect(useNotification.getState().show).toBe(true));
        expect(useNotification.getState()).toMatchObject({
            error: true,
            message: 'settingsInvalid',
        });
    });

    it('sends a refused change again with the next one', async () => {
        answer({ success: false, message: 'settingsInvalid' });
        renderForm();

        await edit('VAT', '2300');
        await waitFor(() => expect(useNotification.getState().show).toBe(true));
        await new Promise((resolve) => setTimeout(resolve, 50));

        await edit('Invoice Filename Prefix', 'INV');
        await waitFor(() => expect(Axios.put).toHaveBeenCalledTimes(2));
        expect(sent(1)).toEqual({ vat: '2300', invoiceFilenamePrefix: 'INV' });
    });
});
