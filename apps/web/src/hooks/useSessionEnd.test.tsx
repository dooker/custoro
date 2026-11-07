import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNotification } from '../store/notification';
import { PATHS, sessionEndedEvent } from '../variables';
import { useSessionEnd } from './useSessionEnd';

const logout = vi.fn();

vi.mock('../contexts/Auth', () => ({
    tokenName: 'loginToken',
    useAuth: () => ({ logout }),
}));

const Page = () => {
    useSessionEnd();

    return <p data-testid="path">{useLocation().pathname}</p>;
};

const renderAt = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <Page />
        </MemoryRouter>
    );

afterEach(() => {
    logout.mockClear();
    useNotification.setState({ show: false, message: '', error: false });
});

describe('useSessionEnd', () => {
    it('logs out, goes to the login page and says the session expired', () => {
        renderAt('/customers/1/');

        expect(screen.getByTestId('path')).toHaveTextContent('/customers/1/');

        act(() => {
            window.dispatchEvent(new Event(sessionEndedEvent));
        });

        expect(logout).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('path')).toHaveTextContent(PATHS.LOGIN);
        expect(useNotification.getState()).toMatchObject({
            show: true,
            error: true,
            message: 'session_expired',
        });
    });

    it('does nothing until the event arrives', () => {
        renderAt('/customers/1/');

        expect(logout).not.toHaveBeenCalled();
        expect(useNotification.getState().show).toBe(false);
    });

    it('stops listening once the page is gone', () => {
        const { unmount } = renderAt('/customers/1/');

        unmount();
        window.dispatchEvent(new Event(sessionEndedEvent));

        expect(logout).not.toHaveBeenCalled();
    });

    // Copilot review of PR 24: a logout in another tab used to call logout() here, which removes the
    // shared token. When the other tab had logged in again before this one handled the event, that
    // removed the new login. This tab now reloads and reads whatever is stored.
    it('reloads, and leaves the stored token alone, when another tab logs out or in', () => {
        const reload = vi.fn();

        vi.stubGlobal('location', { ...window.location, reload });
        localStorage.setItem('loginToken', 'new-login');
        renderAt('/customers/1/');

        for (const [oldValue, newValue] of [
            ['a', null],
            [null, 'new-login'],
        ]) {
            act(() => {
                window.dispatchEvent(
                    new StorageEvent('storage', { key: 'loginToken', oldValue, newValue })
                );
            });
        }

        expect(reload).toHaveBeenCalledTimes(2);
        expect(logout).not.toHaveBeenCalled();
        expect(localStorage.getItem('loginToken')).toBe('new-login');
        // not an expired session: nothing to say
        expect(useNotification.getState().show).toBe(false);

        localStorage.removeItem('loginToken');
        vi.unstubAllGlobals();
    });

    it('ignores other stored settings', () => {
        renderAt('/customers/1/');

        act(() => {
            window.dispatchEvent(
                new StorageEvent('storage', { key: 'language', oldValue: 'en', newValue: 'et' })
            );
        });

        expect(logout).not.toHaveBeenCalled();
        expect(screen.getByTestId('path')).toHaveTextContent('/customers/1/');
    });
});
