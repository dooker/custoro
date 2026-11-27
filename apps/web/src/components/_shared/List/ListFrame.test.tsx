import { act } from '@testing-library/react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../../../test/renderScreen';
import ListFrame from './ListFrame';
import type { ListDataIF } from './listLogic';

const navigate = vi.fn();

vi.mock('react-router', async (original) => ({
    ...(await original<typeof import('react-router')>()),
    useNavigate: () => navigate,
}));

// The API answered page 3 (the last one) for page 99
const pastTheEnd = {
    data: { resource: [{ id: 31 }], meta: { page: 3, pages: 3, rows: 31, limit: 15 } },
    isPending: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
} as unknown as UseQueryResult<ListDataIF<{ id: number }>>;

// Renders again on each call of `again`, inside the router renderScreen gives
let again = () => {};
const Frame = () => {
    const [renders, setRenders] = useState(0);

    again = () => setRenders(renders + 1);

    return (
        <ListFrame
            heading={<span data-testid="renders">{renders}</span>}
            resource="customers"
            query={pastTheEnd}
            page={99}
            // A new function on every render, as ListPage passes it
            pageHref={(number) => `/customers/${number}/`}
        >
            {(rows) => rows.map((row) => <p key={row.id}>{row.id}</p>)}
        </ListFrame>
    );
};

describe('ListFrame', () => {
    // Review of PR 48: the correction ran again on every render while it stood, because its
    // effect depended on pageHref, a new function each time
    it('moves a page past the end to the last page once, however often it renders', () => {
        renderScreen(<Frame />, { path: '/customers/99/' });

        act(() => again());
        act(() => again());

        expect(navigate).toHaveBeenCalledTimes(1);
        expect(navigate).toHaveBeenCalledWith('/customers/3/', { replace: true });
    });
});
