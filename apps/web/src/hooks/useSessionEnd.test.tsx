import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNotification } from '../store/notification';
import { PATHS, sessionEndedEvent } from '../variables';
import { useSessionEnd } from './useSessionEnd';

const logout = vi.fn();

vi.mock('../contexts/Auth', () => ({
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
});
