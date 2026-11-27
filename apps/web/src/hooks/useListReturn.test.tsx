import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useListReturn } from './useListReturn';

const Probe = () => {
    const { listHref, keep, page } = useListReturn('/products/');

    return (
        <>
            <p data-testid="list">{listHref}</p>
            <p data-testid="keep">{keep('/product/2/9/')}</p>
            <p data-testid="page">{page}</p>
        </>
    );
};

const at = (address: string) =>
    render(
        <MemoryRouter initialEntries={[address]}>
            <Routes>
                <Route path="/product/:page/:id/" element={<Probe />} />
            </Routes>
        </MemoryRouter>
    );

// Copilot review of PR 46, round 2: Go back from a product opened in /products/2/?q=cable
// returned to /products/2/, an unfiltered list where page 2 means other rows
describe('useListReturn', () => {
    it('goes back to the page of the list with its search', () => {
        at('/product/2/7/?q=cable');

        expect(screen.getByTestId('list')).toHaveTextContent('/products/2/?q=cable');
        expect(screen.getByTestId('keep')).toHaveTextContent('/product/2/9/?q=cable');
    });

    it('goes back to the plain list when the record was opened without a search', () => {
        at('/product/3/7/');

        expect(screen.getByTestId('list')).toHaveTextContent(/^\/products\/3\/$/);
        expect(screen.getByTestId('keep')).toHaveTextContent(/^\/product\/2\/9\/$/);
    });

    // The rows a page follow the screen: an address from 5.2.0 with ?size= drops it
    it('reads the page the same way as the lists, and drops an old page size', () => {
        at('/product/abc/7/?size=20');

        expect(screen.getByTestId('page')).toHaveTextContent('1');
        expect(screen.getByTestId('list')).toHaveTextContent(/^\/products\/1\/$/);
    });
});
