import { screen } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Axios } from '../../Axios';
import { renderScreen } from '../../test/renderScreen';
import { PATHS, widgetSize } from '../../variables';
import Home from './Home';

vi.mock('../../Axios', () => ({ Axios: { get: vi.fn() } }));
vi.mock('../../contexts/Auth', () => ({ useAuth: () => ({ user: { discount: 0 } }) }));

beforeEach(() => {
    vi.resetAllMocks();
});

describe('Home', () => {
    // The small lists set the page title and buttons when they loaded, and the last one won: Home
    // was called "Invoices" and had a search box that threw "updateKeyword is not a function"
    it('keeps its own title and has no buttons once the small lists have loaded', async () => {
        vi.mocked(Axios.get).mockResolvedValue({
            data: { success: true, resource: [{ id: 1, name: 'Orbit', number: '26001' }] },
        } as AxiosResponse);
        renderScreen(<Home />, { path: PATHS.HOME });

        expect(await screen.findAllByText('Orbit')).not.toHaveLength(0);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dashboard');
        expect(screen.queryByTestId('search-button')).not.toBeInTheDocument();
        expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
            'Latest Worksheets',
            'Latest Invoices',
            'Latest Products',
            'Latest Customers',
        ]);
        const limits = vi
            .mocked(Axios.get)
            .mock.calls.map(([, config]) => (config?.params as { limit?: number })?.limit);
        expect(limits.every((limit) => limit === widgetSize)).toBe(true);
    });
});
