import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Axios } from '../../../Axios';
import { renderScreen } from '../../../test/renderScreen';
import { useConfirmation } from '../../../store/confirmation';
import { useNotification } from '../../../store/notification';
import { endpoint, listPageSize } from '../../../variables';
import ListPage from './ListPage';

vi.mock('../../../Axios', () => ({ Axios: { get: vi.fn(), delete: vi.fn() } }));

interface Row {
    id: number;
    name: string;
}

interface Params {
    page: number;
    limit: number;
    keyword?: string;
}

// An API with `count` customers (Customer 1 ...), paged like the real one: a page past the end
// answers with the last page, and the answer says the page, the pages, the rows and the size
const serve = (count: number) =>
    vi.mocked(Axios.get).mockImplementation(async (_url, config) => {
        const { page: asked, limit } = config?.params as Params;
        const pages = Math.ceil(count / limit);
        const page = Math.min(asked, Math.max(pages, 1));
        const first = (page - 1) * limit + 1;
        const length = Math.max(0, Math.min(limit, count - first + 1));
        const rows = Array.from({ length }, (_, index) => ({
            id: first + index,
            name: `Customer ${first + index}`,
        }));

        return {
            data: {
                success: true,
                resource: rows,
                meta: { page, pages, rows: count, limit, total: pages },
            },
        } as AxiosResponse;
    });

const asked = () => vi.mocked(Axios.get).mock.calls.map(([, config]) => config?.params as Params);

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
            addTestId="add-customer"
            deletable
        />,
        { path, route: '/customers/:page/' }
    );

const typeSearch = async (word: string) => {
    fireEvent.click(screen.getByTestId('search-button'));
    await act(async () => {
        fireEvent.change(screen.getByTestId('search-input'), { target: { value: word } });
        await new Promise((resolve) => setTimeout(resolve, 500));
    });
};

beforeEach(() => {
    vi.resetAllMocks();
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

describe('ListPage', () => {
    it('asks for the page in the address with the same size on every screen', async () => {
        serve(40);
        list('/customers/2/');

        expect(await screen.findByText('Customer 16')).toBeInTheDocument();
        expect(Axios.get).toHaveBeenCalledWith(`${endpoint}/customers/`, {
            params: { page: 2, limit: listPageSize },
        });
        // The row is a link, the title is the page's own
        expect(screen.getByRole('link', { name: '16' })).toHaveAttribute('href', '/customer/2/16/');
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Customers');
    });

    it('says which rows of how many are shown', async () => {
        serve(40);
        list('/customers/3/');

        expect(await screen.findByTestId('list-range')).toHaveTextContent('31–40 of 40');
    });

    it('makes the page numbers links, with first and last, the search kept', async () => {
        serve(100);
        list('/customers/3/?q=cust');
        await screen.findByText('Customer 31');

        expect(screen.getByRole('link', { name: 'Go to page 4' })).toHaveAttribute(
            'href',
            '/customers/4/?q=cust'
        );
        expect(screen.getByRole('link', { name: 'Go to first page' })).toHaveAttribute(
            'href',
            '/customers/1/?q=cust'
        );
        expect(screen.getByRole('link', { name: 'Go to last page' })).toHaveAttribute(
            'href',
            '/customers/7/?q=cust'
        );
        expect(screen.getByRole('link', { name: 'page 3' })).toHaveAttribute(
            'aria-current',
            'page'
        );
    });

    // Copilot review of PR 46, round 2: opening a row dropped the list's search and page size, so
    // Go back on the record returned to an unfiltered list of 15 rows a page
    it('opens a row and Add with the list\u2019s search and page size', async () => {
        serve(100);
        list('/customers/3/?q=cust&size=30');
        await screen.findByText('Customer 61');

        expect(screen.getByRole('link', { name: '61' })).toHaveAttribute(
            'href',
            '/customer/3/61/?q=cust&size=30'
        );

        fireEvent.click(screen.getByTestId('add-customer'));

        expect(await screen.findByTestId('path')).toHaveTextContent(
            '/customer/3/0/?q=cust&size=30'
        );
    });

    it('goes to the last page for a page past the end', async () => {
        serve(40);
        list('/customers/9/');

        expect(await screen.findByText('Customer 31')).toBeInTheDocument();
        await waitFor(() => expect(asked().map(({ page }) => page)).toContain(3));
        expect(screen.getByTestId('list-range')).toHaveTextContent('31–40 of 40');
        expect(screen.queryByText('No entries')).not.toBeInTheDocument();
    });

    it('loads the next page ahead, and not past the last one', async () => {
        serve(40);
        list('/customers/2/');
        await screen.findByText('Customer 16');

        await waitFor(() => expect(asked().map(({ page }) => page)).toEqual([2, 3]));
    });

    it('offers 15, 30 and 50 rows; another size starts on page 1', async () => {
        serve(100);
        list('/customers/3/');
        await screen.findByText('Customer 31');

        fireEvent.change(screen.getByTestId('page-size'), { target: { value: '50' } });

        expect(await screen.findByText('Customer 1')).toBeInTheDocument();
        expect(asked()).toContainEqual({ page: 1, limit: 50 });
        expect(screen.getByTestId('list-range')).toHaveTextContent('1–50 of 100');
        expect(screen.getByTestId('page-size')).toHaveValue('50');
    });

    it('takes the page size from the address', async () => {
        serve(100);
        list('/customers/1/?size=30');

        expect(await screen.findByText('Customer 30')).toBeInTheDocument();
        expect(asked()[0]).toEqual({ page: 1, limit: 30 });
    });

    it('starts a search on page 1, wherever the search began', async () => {
        serve(100);
        list('/customers/3/');
        await screen.findByText('Customer 31');

        await typeSearch('orb');

        expect(asked()).toContainEqual({ page: 1, limit: listPageSize, keyword: 'orb' });
    });

    it('opens with the search in the address, box open', async () => {
        serve(40);
        list('/customers/1/?q=orb');

        expect(await screen.findByText('Customer 1')).toBeInTheDocument();
        expect(screen.getByTestId('search-input')).toHaveValue('orb');
        expect(asked()[0]).toEqual({ page: 1, limit: listPageSize, keyword: 'orb' });
    });

    it('scrolls to the top of the list on another page', async () => {
        serve(40);
        list('/customers/1/');
        await screen.findByText('Customer 1');
        expect(window.scrollTo).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('link', { name: 'Go to page 2' }));

        expect(await screen.findByText('Customer 16')).toBeInTheDocument();
        expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 });
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
        serve(0);
        list();

        expect(await screen.findByText('No entries')).toBeInTheDocument();
        expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
        expect(screen.queryByTestId('list-range')).not.toBeInTheDocument();
    });

    it('goes to the page before after deleting the last row of a page, search and size kept', async () => {
        serve(61);
        list('/customers/3/?q=la&size=30');
        await screen.findByText('Customer 61');

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        expect(useConfirmation.getState().params).toMatchObject({
            id: 61,
            resource: 'customers',
            page: 2,
            returnTo: '/customers/2/?q=la&size=30',
        });
    });

    // Copilot review of PR 46: a refused delete (the customer is on an invoice) still moved the
    // user to the page before, as if the row were gone
    describe('after the confirmation', () => {
        const confirmDelete = async (answer: { success: boolean; message?: string }) => {
            serve(61);
            vi.mocked(Axios.delete).mockResolvedValue({ data: answer } as AxiosResponse);
            list('/customers/3/?q=la&size=30');
            await screen.findByText('Customer 61');

            fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
            const { callback, params } = useConfirmation.getState();
            await act(async () => callback(params));
        };

        it('stays on the page when the delete is refused, and says why', async () => {
            await confirmDelete({ success: false, message: 'customer.inUse' });

            await waitFor(() => expect(useNotification.getState().message).toBe('customer.inUse'));
            expect(asked().map(({ page }) => page)).not.toContain(2);
            expect(screen.getByText('Customer 61')).toBeInTheDocument();
        });

        it('goes to the page before when the last row of the page is deleted', async () => {
            await confirmDelete({ success: true });

            await waitFor(() =>
                expect(asked()).toContainEqual({ page: 2, limit: 30, keyword: 'la' })
            );
        });
    });
});
