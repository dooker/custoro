import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Axios } from '../../Axios';
import { tokenName } from '../../contexts/Auth';
import { renderScreen } from '../../test/renderScreen';
import { getLoginUrl } from '../../utils/auth';
import { endpoint, lastUrl, PATHS, RESOURCE } from '../../variables';
import Login from './Login';

const auth = vi.hoisted(() => ({
    isAuth: false,
    refreshAuth: vi.fn(),
    setErrorMessage: vi.fn(),
}));

vi.mock('../../Axios', () => ({ Axios: { post: vi.fn(), put: vi.fn() } }));
vi.mock('../../contexts/Auth', () => ({ tokenName: 'loginToken', useAuth: () => auth }));

const answer = (data: unknown) =>
    vi.mocked(Axios.post).mockResolvedValue({ data } as AxiosResponse);

const fail = (error: AxiosError) => vi.mocked(Axios.post).mockRejectedValue(error);

const renderLogin = () => renderScreen(<Login />, { path: PATHS.LOGIN });

const fill = async (label: string, value: string) =>
    fireEvent.change(await screen.findByLabelText(label), { target: { value } });

const logIn = async (username: string, password: string) => {
    await fill('Username', username);
    await fill('Password', password);
    fireEvent.click(screen.getByTestId('login-submit-button'));
};

beforeEach(() => {
    vi.resetAllMocks();
    auth.isAuth = false;
});

afterEach(() => {
    localStorage.clear();
});

describe('Login', () => {
    it('signs in with the typed credentials and keeps the token', async () => {
        answer({ success: true, token: 'jwt-1' });
        renderLogin();

        await logIn('cadet@example.test', 'correct horse');

        await waitFor(() => expect(localStorage.getItem(tokenName)).toBe('jwt-1'));
        expect(Axios.post).toHaveBeenCalledWith(getLoginUrl(endpoint, RESOURCE.LOGIN), {
            username: 'cadet@example.test',
            password: 'correct horse',
        });
        expect(auth.setErrorMessage).toHaveBeenCalledWith(null);
        expect(auth.refreshAuth).toHaveBeenCalledTimes(1);
    });

    it('signs in when the form is submitted from the keyboard', async () => {
        answer({ success: true, token: 'jwt-2' });
        renderLogin();

        await fill('Username', 'cadet@example.test');
        await fill('Password', 'correct horse');
        fireEvent.submit(screen.getByLabelText('Username').closest('form') as HTMLFormElement);

        await waitFor(() => expect(localStorage.getItem(tokenName)).toBe('jwt-2'));
    });

    it('shows the answer of a refused login and keeps no token', async () => {
        answer({ success: false, message: 'None shall pass!' });
        renderLogin();

        await logIn('cadet@example.test', 'not-the-password');

        expect(await screen.findByText('None shall pass!')).toBeInTheDocument();
        expect(localStorage.getItem(tokenName)).toBeNull();
        expect(auth.refreshAuth).not.toHaveBeenCalled();
    });

    it.each([
        [
            'the message of an HTTP error',
            new AxiosError('Request failed', 'ERR_BAD_RESPONSE', undefined, undefined, {
                status: 429,
                data: { success: false, message: 'Too many attempts' },
            } as AxiosResponse),
            'Too many attempts',
        ],
        ['a network error', new AxiosError('Network Error'), 'Network Error'],
    ])('shows %s and tells the session', async (_name, error, message) => {
        fail(error);
        renderLogin();

        await logIn('cadet@example.test', 'correct horse');

        expect(await screen.findByText(message)).toBeInTheDocument();
        expect(auth.setErrorMessage).toHaveBeenCalledWith(message);
        expect(localStorage.getItem(tokenName)).toBeNull();
    });

    it('asks for both fields and sends nothing when the form is empty', async () => {
        renderLogin();

        await screen.findByLabelText('Username');
        fireEvent.click(screen.getByTestId('login-submit-button'));

        expect(await screen.findByText('Username is required')).toBeInTheDocument();
        expect(screen.getByText('Password is required')).toBeInTheDocument();
        expect(Axios.post).not.toHaveBeenCalled();
    });

    it('sends nothing for a username that is not an email', async () => {
        renderLogin();

        await logIn('captain', 'correct horse');

        expect(await screen.findByText('Email format is incorrect')).toBeInTheDocument();
        expect(Axios.post).not.toHaveBeenCalled();
    });

    it('links to the forgot password page', async () => {
        renderLogin();

        expect(await screen.findByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
            'href',
            PATHS.FORGOT
        );
    });
});

describe('Login when already signed in', () => {
    it('goes back to the last visited page', async () => {
        auth.isAuth = true;
        localStorage.setItem(tokenName, 'jwt-1');
        localStorage.setItem(lastUrl, PATHS.INVOICES);

        renderLogin();

        expect(await screen.findByTestId('path')).toHaveTextContent(PATHS.INVOICES);
    });

    it('stays on the form when no token is stored', async () => {
        auth.isAuth = true;
        renderLogin();

        await screen.findByLabelText('Username');
        // The redirect waits one tick, so let it pass before looking
        await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

        expect(screen.queryByTestId('path')).not.toBeInTheDocument();
    });
});
