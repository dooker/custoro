import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Axios } from '../../../Axios';
import { renderScreen } from '../../../test/renderScreen';
import { useConfirmation } from '../../../store/confirmation';
import { useNotification } from '../../../store/notification';
import { endpoint } from '../../../variables';
import ListPage from './ListPage';
import { listHeights } from './listLogic';

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
        const params = config?.params as Params | undefined;

        // A list request always carries its page and size; say so instead of a destructuring crash
        if (!params) {
            throw new Error('a list request without page and limit');
        }

        const { page: asked, limit } = params;
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

// jsdom draws nothing, so a list measures its own heights (listHeights) from the top of the window:
// a window this high fits `fits` rows
const windowFor = (rows: number) =>
    listHeights.head + listHeights.footer + listHeights.below + rows * listHeights.row + 1;
const fits = 15;

const resizeTo = async (rows: number) => {
    await act(async () => {
        window.innerHeight = windowFor(rows);
        window.dispatchEvent(new Event('resize'));
        await new Promise((resolve) => setTimeout(resolve, 200));
    });
};

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

// Rows drawn this high, as a browser would measure them (jsdom measures everything as 0)
const drawRowsAt = (height: number) =>
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement
    ) {
        const row = this.tagName === 'TR' && this.parentElement?.tagName === 'TBODY';

        return DOMRect.fromRect({ x: 0, y: 0, width: 0, height: row ? height : 0 });
    });

afterEach(() => {
    vi.restoreAllMocks();
});

beforeEach(() => {
    vi.resetAllMocks();
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    window.innerHeight = windowFor(fits);
});

describe('ListPage', () => {
    it('asks for the page in the address with as many rows as fit on the screen', async () => {
        serve(40);
        list('/customers/2/');

        expect(await screen.findByText('Customer 16')).toBeInTheDocument();
        expect(Axios.get).toHaveBeenCalledWith(`${endpoint}/customers/`, {
            params: { page: 2, limit: fits },
        });
        // Not before the size is known
        expect(asked().map(({ limit }) => limit)).not.toContain(0);
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

    // Copilot review of PR 46, round 2: opening a row dropped the list's search, so Go back on
    // the record returned to an unfiltered list
    it('opens a row and Add with the list\u2019s search', async () => {
        serve(100);
        list('/customers/3/?q=cust');
        await screen.findByText('Customer 31');

        expect(screen.getByRole('link', { name: '31' })).toHaveAttribute(
            'href',
            '/customer/3/31/?q=cust'
        );

        fireEvent.click(screen.getByTestId('add-customer'));

        expect(await screen.findByTestId('path')).toHaveTextContent('/customer/3/0/?q=cust');
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

    it('has no rows-per-page choice', async () => {
        serve(100);
        list('/customers/1/');
        await screen.findByText('Customer 1');

        expect(screen.queryByTestId('page-size')).not.toBeInTheDocument();
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('fits the rows again after a resize, on the page with the first row seen', async () => {
        serve(100);
        list('/customers/3/?q=cust');
        await screen.findByText('Customer 31');

        // Taller: 30 rows a page, row 31 is on page 2
        await resizeTo(30);
        expect(await screen.findByText('Customer 60')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'page 2' })).toHaveAttribute(
            'aria-current',
            'page'
        );
        expect(screen.getByRole('link', { name: '31' })).toHaveAttribute(
            'href',
            '/customer/2/31/?q=cust'
        );
        expect(screen.getByTestId('list-range')).toHaveTextContent('31–60 of 100');
        // The first request with the new size is for the new page, not the old page 3 (that one
        // comes only as the page after it, loaded ahead)
        expect(asked().filter(({ limit }) => limit === 30)[0]).toEqual({
            page: 2,
            limit: 30,
            keyword: 'cust',
        });

        // Shorter: 10 rows a page, row 31 is on page 4
        await resizeTo(10);
        await waitFor(() =>
            expect(screen.getByTestId('list-range')).toHaveTextContent('31–40 of 100')
        );
        expect(screen.getByRole('link', { name: 'page 4' })).toHaveAttribute(
            'aria-current',
            'page'
        );
    });

    // Found while building it: the first measurement (before the rows are drawn) uses the list's
    // own heights; when the drawn rows are higher, the second one has fewer rows and moved
    // /customers/3/ to page 2 on load, as if the window had been resized
    it('settles its size once the rows are drawn without moving the page', async () => {
        drawRowsAt(60);
        serve(100);
        list('/customers/3/');

        // 15 rows of 41 fit, 10 of 60: page 3 is rows 21 to 30 (moving to keep row 31 in view
        // would be page 4)
        await waitFor(() =>
            expect(screen.getByTestId('list-range')).toHaveTextContent('21–30 of 100')
        );
        expect(screen.getByText('Customer 21')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'page 3' })).toHaveAttribute(
            'aria-current',
            'page'
        );
        // The first request with 10 rows is page 3 (page 4 comes after it, loaded ahead)
        expect(asked().find(({ limit }) => limit === 10)).toEqual({ page: 3, limit: 10 });
    });

    it('asks once for a burst of resizes (dragging the window edge)', async () => {
        serve(100);
        list('/customers/1/');
        await screen.findByText('Customer 15');

        // Each event in its own act, so React draws in between as a browser would; each comes
        // before the one before it settles (150 ms)
        for (const rows of [18, 22, 26, 30]) {
            await act(async () => {
                window.innerHeight = windowFor(rows);
                window.dispatchEvent(new Event('resize'));
                await new Promise((resolve) => setTimeout(resolve, 100));
            });
        }
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 200));
        });

        expect(await screen.findByText('Customer 30')).toBeInTheDocument();
        // Only the last size was asked for (page 1 and the page after it)
        expect(new Set(asked().map(({ limit }) => limit))).toEqual(new Set([fits, 30]));
    });

    it('does not pull the user back to the list after a resize just before leaving it', async () => {
        serve(100);
        list('/customers/3/');
        await screen.findByText('Customer 31');

        await act(async () => {
            window.innerHeight = windowFor(30);
            window.dispatchEvent(new Event('resize'));
        });
        fireEvent.click(screen.getByRole('link', { name: '31' }));
        expect(await screen.findByTestId('path')).toHaveTextContent('/customer/3/31/');

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 200));
        });

        expect(screen.getByTestId('path')).toHaveTextContent('/customer/3/31/');
        expect(asked().map(({ limit }) => limit)).not.toContain(30);
    });

    // Copilot review of PR 47: while the next page loads, the rows on screen are still the
    // page before (placeholder data), and a resize then has to keep those rows, not the page asked
    it('keeps the rows on screen when the window is resized while the next page loads', async () => {
        serve(100);
        const paged = vi.mocked(Axios.get).getMockImplementation()!;
        let release = () => {};

        // Page 5 (not loaded ahead) answers only when let go
        vi.mocked(Axios.get).mockImplementation(async (url, config) => {
            const { page, limit } = config?.params as Params;

            if (page === 5 && limit === fits) {
                await new Promise<void>((resolve) => (release = resolve));
            }

            return paged(url, config);
        });
        list('/customers/3/');
        await screen.findByText('Customer 31');

        fireEvent.click(screen.getByRole('link', { name: 'Go to page 5' }));
        await waitFor(() => expect(asked()).toContainEqual({ page: 5, limit: fits }));
        // Still page 3's rows, 31 to 45
        expect(screen.getByText('Customer 31')).toBeInTheDocument();

        // 5 rows a page: row 31 is on page 7 (page 5's first row, 61, would be page 13)
        await resizeTo(5);
        await waitFor(() =>
            expect(screen.getByTestId('list-range')).toHaveTextContent('31–35 of 100')
        );
        expect(asked()).not.toContainEqual({ page: 13, limit: 5 });
        release();
    });

    it('ignores the page size of an older address', async () => {
        serve(100);
        list('/customers/1/?size=30');

        expect(await screen.findByText('Customer 15')).toBeInTheDocument();
        expect(asked()[0]).toEqual({ page: 1, limit: fits });
    });

    it('starts a search on page 1, wherever the search began', async () => {
        serve(100);
        list('/customers/3/');
        await screen.findByText('Customer 31');

        await typeSearch('orb');

        expect(asked()).toContainEqual({ page: 1, limit: fits, keyword: 'orb' });
    });

    it('opens with the search in the address, box open', async () => {
        serve(40);
        list('/customers/1/?q=orb');

        expect(await screen.findByText('Customer 1')).toBeInTheDocument();
        expect(screen.getByTestId('search-input')).toHaveValue('orb');
        expect(asked()[0]).toEqual({ page: 1, limit: fits, keyword: 'orb' });
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

    it('goes to the page before after deleting the last row of a page, search kept', async () => {
        serve(31);
        list('/customers/3/?q=la');
        await screen.findByText('Customer 31');

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        expect(useConfirmation.getState().params).toMatchObject({
            id: 31,
            resource: 'customers',
            page: 2,
            returnTo: '/customers/2/?q=la',
        });
    });

    // Copilot review of PR 46: a refused delete (the customer is on an invoice) still moved the
    // user to the page before, as if the row were gone
    describe('after the confirmation', () => {
        const confirmDelete = async (answer: { success: boolean; message?: string }) => {
            serve(31);
            vi.mocked(Axios.delete).mockResolvedValue({ data: answer } as AxiosResponse);
            list('/customers/3/?q=la');
            await screen.findByText('Customer 31');

            fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
            const { callback, params } = useConfirmation.getState();
            await act(async () => callback(params));
        };

        it('stays on the page when the delete is refused, and says why', async () => {
            await confirmDelete({ success: false, message: 'customer.inUse' });

            await waitFor(() => expect(useNotification.getState().message).toBe('customer.inUse'));
            expect(asked().map(({ page }) => page)).not.toContain(2);
            expect(screen.getByText('Customer 31')).toBeInTheDocument();
        });

        it('goes to the page before when the last row of the page is deleted', async () => {
            await confirmDelete({ success: true });

            await waitFor(() =>
                expect(asked()).toContainEqual({ page: 2, limit: fits, keyword: 'la' })
            );
        });
    });
});
