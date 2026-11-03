import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppContent from './AppContent';
import { renderScreen } from './test/renderScreen';

let role: string;

vi.mock('./contexts/Auth', () => ({
    tokenName: 'loginToken',
    useAuth: () => ({
        loading: false,
        errorMessage: null,
        isAuth: true,
        user: { name: 'Test', role },
        logout: vi.fn(),
    }),
}));
vi.mock('./hooks/useSessionEnd', () => ({ useSessionEnd: () => undefined }));
vi.mock('./components/_shared/Navigation/Navigation', () => ({ default: () => null }));
vi.mock('./components/_shared/Notification/Notification', () => ({ default: () => null }));
vi.mock('./components/_shared/Confirmation/Confirmation', () => ({ default: () => null }));

// The admin pages themselves are not under test, only whether the route lets a user reach them
vi.mock('./components/Users/Users', () => ({ default: () => <p>users page</p> }));
vi.mock('./components/User/User', () => ({ default: () => <p>user page</p> }));
vi.mock('./components/Settings/Settings', () => ({ default: () => <p>settings page</p> }));
vi.mock('./components/Home/Home', () => ({ default: () => <p>home page</p> }));

const adminPages: [string, string, string][] = [
    ['the user list', '/users/1/', 'users page'],
    ['a user', '/user/1/5/', 'user page'],
    ['the new user form', '/user/1/0/', 'user page'],
    ['the settings', '/settings/', 'settings page'],
    ['a settings tab', '/settings/server/', 'settings page'],
];

const open = (path: string, route: string) => renderScreen(<AppContent />, { path, route });

beforeEach(() => {
    role = 'user';
});

describe('admin pages', () => {
    it.each(adminPages)('shows a regular user the 404 page for %s', async (_name, path, page) => {
        open(path, '/*');

        expect(await screen.findByText('404')).toBeInTheDocument();
        expect(screen.queryByText(page)).not.toBeInTheDocument();
    });

    it.each(adminPages)('shows an admin %s', async (_name, path, page) => {
        role = 'admin';
        open(path, '/*');

        expect(await screen.findByText(page)).toBeInTheDocument();
        expect(screen.queryByText('404')).not.toBeInTheDocument();
    });

    it('still shows a regular user the pages that are for everyone', async () => {
        open('/home/', '/*');

        expect(await screen.findByText('home page')).toBeInTheDocument();
    });
});
