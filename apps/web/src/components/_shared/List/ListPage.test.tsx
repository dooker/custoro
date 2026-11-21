import { act, fireEvent, screen } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Axios } from '../../../Axios';
import { renderScreen } from '../../../test/renderScreen';
import { useConfirmation } from '../../../store/confirmation';
import { endpoint, listPageSize } from '../../../variables';
import ListPage from './ListPage';

vi.mock('../../../Axios', () => ({ Axios: { get: vi.fn(), delete: vi.fn() } }));

interface Row {
    id: number;
    name: string;
}

const answer = (rows: Row[], pages = 1, page = 1) =>
    ({
        data: { success: true, resource: rows, meta: { total: pages, page } },
    }) as AxiosResponse;

const list = (path = '/customers/1/') =>
    renderScreen(
        <ListPage<Row>
            resource="customers"
            path="/customers/"
            title="customers.plural"
            columns={[
                { key: 'id', label: '#', className: 'id' },
                { key: 'name', label: 'customers.form.name', className: 'name' },
            ]}
            rowHref={({ id }, page) => `/customer/${page}/${id}/`}
            addHref={(page) => `/customer/${page}/0/`}
            deletable
        />,
        { path, route: '/customers/:page/' }
    );

const lastCall = () => vi.mocked(Axios.get).mock.calls.at(-1);

beforeEach(() => {
    vi.resetAllMocks();
});

describe('ListPage', () => {
    it('asks for the page in the address with the same size on every screen', async () => {
        vi.mocked(Axios.get).mockResolvedValue(answer([{ id: 7, name: 'Orbit' }], 3, 2));
        list('/customers/2/');

        expect(await screen.findByText('Orbit')).toBeInTheDocument();
        expect(lastCall()).toEqual([
            `${endpoint}/customers/`,
            { params: { page: 2, limit: listPageSize } },
        ]);
        // The row is a link, the title is the page's own
        expect(screen.getByRole('link', { name: '7' })).toHaveAttribute('href', '/customer/2/7/');
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Customers');
    });

    it('starts a search on page 1, wherever the search began', async () => {
        vi.mocked(Axios.get).mockResolvedValue(answer([{ id: 7, name: 'Orbit' }], 5, 3));
        list('/customers/3/');
        await screen.findByText('Orbit');

        fireEvent.click(screen.getByTestId('search-button'));
        await act(async () => {
            fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'orb' } });
            await new Promise((resolve) => setTimeout(resolve, 500));
        });

        expect(lastCall()).toEqual([
            `${endpoint}/search/`,
            { params: { resource: 'customers', keyword: 'orb', page: 1, limit: listPageSize } },
        ]);
    });

    it('opens with the search in the address, box open', async () => {
        vi.mocked(Axios.get).mockResolvedValue(answer([{ id: 7, name: 'Orbit' }]));
        list('/customers/1/?q=orb');

        expect(await screen.findByText('Orbit')).toBeInTheDocument();
        expect(screen.getByTestId('search-input')).toHaveValue('orb');
        expect(lastCall()?.[0]).toBe(`${endpoint}/search/`);
    });

    it('says the list could not be loaded instead of "No entries"', async () => {
        vi.mocked(Axios.get).mockRejectedValue(new AxiosError('Network Error'));
        list();

        expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(
            'The list could not be loaded'
        );
        expect(screen.queryByText('No entries')).not.toBeInTheDocument();
    });

    it('says the list could not be loaded when the API refuses', async () => {
        vi.mocked(Axios.get).mockResolvedValue({
            data: { success: false, message: 'forbidden' },
        } as AxiosResponse);
        list();

        expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toBeInTheDocument();
    });

    it('shows "No entries" for an empty list, with no pages', async () => {
        vi.mocked(Axios.get).mockResolvedValue(answer([], 0));
        list();

        expect(await screen.findByText('No entries')).toBeInTheDocument();
        expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('goes to the page before after deleting the last row of a page, search kept', async () => {
        vi.mocked(Axios.get).mockResolvedValue(answer([{ id: 9, name: 'Last' }], 3, 3));
        list('/customers/3/?q=la');
        await screen.findByText('Last');

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        expect(useConfirmation.getState().params).toMatchObject({
            id: 9,
            resource: 'customers',
            page: 2,
            returnTo: '/customers/2/?q=la',
        });
    });
});
