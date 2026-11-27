import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../../../test/renderScreen';
import Navigation from './Navigation';

vi.mock('../../../contexts/Auth', () => ({
    useAuth: () => ({
        user: { name: 'Captain Ledger', role: 'admin', owner: 1 },
        logout: vi.fn(),
    }),
}));

const wideWidth = window.innerWidth;

const openMenu = () => screen.getByRole('button', { name: 'Open the menu' });
const menu = () => document.getElementById('main-menu') as HTMLElement;

afterEach(() => {
    window.innerWidth = wideWidth;
});

describe('Navigation on a phone', () => {
    // On every path, as in the app: the menu stays while the page under it changes
    const phone = () => {
        window.innerWidth = 375;
        renderScreen(<Navigation />, { path: '/customers/1/', route: '*' });
    };

    it('starts closed, out of reach of Tab and screen readers', () => {
        phone();

        expect(openMenu()).toHaveAttribute('aria-expanded', 'false');
        expect(menu()).toHaveAttribute('inert');
    });

    it('opens over the page from the toggle, which then closes it', () => {
        phone();

        fireEvent.click(openMenu());

        const close = screen.getByRole('button', { name: 'Close the menu' });

        expect(close).toHaveAttribute('aria-expanded', 'true');
        expect(menu()).not.toHaveAttribute('inert');
        // The page under it does not scroll with a swipe
        expect(document.body.style.overflow).toBe('hidden');

        fireEvent.click(close);

        expect(openMenu()).toHaveAttribute('aria-expanded', 'false');
        expect(document.body.style.overflow).toBe('');
    });

    it('closes with Escape', () => {
        phone();
        fireEvent.click(openMenu());

        fireEvent.keyDown(document, { key: 'Escape' });

        expect(openMenu()).toHaveAttribute('aria-expanded', 'false');
        expect(menu()).toHaveAttribute('inert');
    });

    it('closes when a page is opened from it', () => {
        phone();
        fireEvent.click(openMenu());

        fireEvent.click(screen.getByTestId('main-link-products'));

        expect(openMenu()).toHaveAttribute('aria-expanded', 'false');
        expect(menu()).toHaveAttribute('inert');
    });
});

describe('Navigation on a wide screen', () => {
    it('is always there as a sidebar, whatever the toggle says', () => {
        renderScreen(<Navigation />, { path: '/customers/1/' });

        expect(menu()).not.toHaveAttribute('inert');

        fireEvent.click(openMenu());

        // The toggle is hidden by the stylesheet there; a click on it changes nothing
        expect(openMenu()).toHaveAttribute('aria-expanded', 'false');
        expect(document.body.style.overflow).toBe('');
    });
});
