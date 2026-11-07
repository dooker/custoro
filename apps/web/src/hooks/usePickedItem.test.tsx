import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePickedItem } from './usePickedItem';
import { RESOURCE } from '../variables';

const getSingle = vi.fn();

vi.mock('../utils/Getters/getSingle', () => ({
    getSingle: (args: { id: number }) => getSingle(args),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
        {children}
    </QueryClientProvider>
);

const domestic = { id: 1, name: 'Nebula Noodles OÜ', vatNumber: 'EE100000001' };
const foreign = { id: 2, name: 'Asteroid Accounting SIA', vatNumber: 'LV00000000015' };

describe('usePickedItem', () => {
    // Copilot review of PR 24, round 3: while a newly chosen customer loaded, the hook gave the one
    // before it, so the invoice showed the new choice with the old customer's VAT and totals
    it('never gives the item before while a new choice loads, and says it is loading', async () => {
        let answerForeign: (value: typeof foreign) => void = () => undefined;

        getSingle.mockImplementation(({ id }: { id: number }) =>
            id === 1
                ? Promise.resolve(domestic)
                : new Promise((resolve) => {
                      answerForeign = resolve;
                  })
        );

        const { result, rerender } = renderHook(
            ({ id }: { id: number }) => usePickedItem<typeof domestic>(RESOURCE.CUSTOMER, id),
            { wrapper, initialProps: { id: 1 } }
        );

        await waitFor(() => expect(result.current.item).toEqual(domestic));

        rerender({ id: 2 });

        expect(result.current.item).toBeNull();
        expect(result.current.isPending).toBe(true);
        // still not the first load: the form stays on screen
        expect(result.current.isLoading).toBe(false);

        answerForeign(foreign);

        await waitFor(() => expect(result.current.item).toEqual(foreign));
        expect(result.current.isPending).toBe(false);
    });

    it('asks for nothing without an id', () => {
        getSingle.mockClear();

        const { result } = renderHook(() => usePickedItem(RESOURCE.CUSTOMER, null), { wrapper });

        expect(result.current).toEqual({ item: null, isLoading: false, isPending: false });
        expect(getSingle).not.toHaveBeenCalled();
    });
});
