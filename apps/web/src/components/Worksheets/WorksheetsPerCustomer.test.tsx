import { act, screen, waitFor } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Axios } from '../../Axios';
import { renderScreen } from '../../test/renderScreen';
import { listHeights } from '../_shared/List/listLogic';
import WorksheetsPerCustomer from './WorksheetsPerCustomer';

vi.mock('../../Axios', () => ({ Axios: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
vi.mock('../../contexts/Auth', () => ({ useAuth: () => ({ user: { discount: 0 } }) }));

interface Params {
    page: number;
    limit: number;
    customer?: string;
}

// A customer with `count` worksheets, paged like the API; its name, invoices and the last number
const serve = (count: number) =>
    vi.mocked(Axios.get).mockImplementation(async (url, config) => {
        if (url.includes('/invoice/')) {
            return { data: { success: true, data: url.includes('/last/') ? '7' : [] } };
        }

        if (url.includes('/customer/')) {
            return { data: { success: true, data: [{ id: 4, name: 'Orbit Garage' }] } };
        }

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

        return {
            data: {
                success: true,
                resource: Array.from({ length }, (_, index) => ({
                    id: first + index,
                    code: `WS-${first + index}`,
                    name: `Sheet ${first + index}`,
                    price: 10,
                    quantity: 1,
                })),
                meta: { page, pages, rows: count, limit, total: pages },
            },
        } as AxiosResponse;
    });

const worksheetRequests = () =>
    vi
        .mocked(Axios.get)
        .mock.calls.filter(([url]) => url.endsWith('/worksheets/'))
        .map(([, config]) => config?.params as Params);

const windowFor = (rows: number) =>
    listHeights.head + listHeights.footer + listHeights.below + rows * listHeights.row + 1;

const open = (path: string) =>
    renderScreen(<WorksheetsPerCustomer />, {
        path,
        route: '/worksheets/:page/:customerId/:worksheetPage/',
    });

beforeEach(() => {
    vi.resetAllMocks();
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    window.innerHeight = windowFor(15);
});

// A customer's worksheets are a list of their own (checkboxes, "Add to invoice"), on the same
// rows that fit the window as every other list
describe('WorksheetsPerCustomer', () => {
    it('asks for the customer’s worksheets with as many rows as fit', async () => {
        serve(40);
        open('/worksheets/2/4/1/');

        expect(await screen.findByText('Sheet 15')).toBeInTheDocument();
        expect(worksheetRequests()[0]).toEqual({ page: 1, limit: 15, customer: '4' });
        expect(worksheetRequests().map(({ limit }) => limit)).not.toContain(0);
        expect(screen.getByTestId('list-range')).toHaveTextContent('1–15 of 40');
        expect(screen.queryByTestId('page-size')).not.toBeInTheDocument();
    });

    it('fits the rows again after a resize, on the page with the first row seen', async () => {
        serve(40);
        open('/worksheets/2/4/3/');
        await screen.findByText('Sheet 31');

        // 10 rows a page: row 31 is on page 4, the customer list's page 2 stays in the address
        await act(async () => {
            window.innerHeight = windowFor(10);
            window.dispatchEvent(new Event('resize'));
            await new Promise((resolve) => setTimeout(resolve, 200));
        });

        await waitFor(() =>
            expect(screen.getByTestId('list-range')).toHaveTextContent('31–40 of 40')
        );
        expect(screen.getByRole('link', { name: 'page 4' })).toHaveAttribute(
            'href',
            '/worksheets/2/4/4/'
        );
        expect(screen.getByRole('link', { name: 'page 4' })).toHaveAttribute(
            'aria-current',
            'page'
        );
    });
});
