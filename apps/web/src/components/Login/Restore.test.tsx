import { fireEvent, screen, waitFor } from '@testing-library/react';
import { type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Axios } from '../../Axios';
import { renderScreen } from '../../test/renderScreen';
import { getResetTokenUrl } from '../../utils/auth';
import { endpoint, PATHS } from '../../variables';
import Restore from './Restore';

const token = 'a'.repeat(64);

vi.mock('../../Axios', () => ({ Axios: { post: vi.fn(), put: vi.fn() } }));
vi.mock('../../contexts/Auth', () => ({
    tokenName: 'loginToken',
    useAuth: () => ({ setErrorMessage: vi.fn() }),
}));

const answer = (method: 'post' | 'put', data: unknown) =>
    vi.mocked(Axios[method]).mockResolvedValue({ data } as AxiosResponse);

const renderRestore = () =>
    renderScreen(<Restore />, {
        path: `${PATHS.RESTORE}${token}/`,
        route: `${PATHS.RESTORE}:token/`,
    });

const save = async (password: string, confirmation: string) => {
    fireEvent.change(await screen.findByLabelText('Password'), { target: { value: password } });
    fireEvent.change(screen.getByLabelText('Password confirmation'), {
        target: { value: confirmation },
    });

    const button = screen.getByRole('button', { name: 'Save' });

    // The button waits while the link is being checked
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
};

beforeEach(() => {
    vi.resetAllMocks();
    // A link the API knows
    answer('post', { success: true });
});

describe('Restore', () => {
    it('checks the link when the page opens', async () => {
        renderRestore();

        await waitFor(() =>
            expect(Axios.post).toHaveBeenCalledWith(getResetTokenUrl(endpoint), { token })
        );
        expect(Axios.post).toHaveBeenCalledTimes(1);
    });

    it('saves the new password for the link and leaves the page', async () => {
        answer('put', { success: true });
        renderRestore();

        await save('new password', 'new password');

        expect(await screen.findByTestId('path')).toHaveTextContent(/^\/$/);
        expect(Axios.put).toHaveBeenCalledWith(getResetTokenUrl(endpoint), {
            password: 'new password',
            token,
        });
    });

    it('sends nothing when the two passwords differ', async () => {
        renderRestore();

        await save('new password', 'other password');

        expect(await screen.findAllByText('Passwords do not match')).toHaveLength(2);
        expect(Axios.put).not.toHaveBeenCalled();
    });

    it('sends nothing for a password that is too short', async () => {
        renderRestore();

        await save('short', 'short');

        expect(
            await screen.findByText('Password must be 8 to 72 characters long')
        ).toBeInTheDocument();
        expect(Axios.put).not.toHaveBeenCalled();
    });

    it('sends nothing when the fields are empty', async () => {
        renderRestore();

        await save('', '');

        expect(await screen.findAllByText('Password is required')).not.toHaveLength(0);
        expect(Axios.put).not.toHaveBeenCalled();
    });

    it('says a link the API does not know is not recognized, and cannot be saved', async () => {
        answer('post', { success: false });
        renderRestore();

        expect(await screen.findByText(/Token is not recognized/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    // A rejected password can be changed and sent again; a link the API refuses cannot be saved
    it.each([
        ['passwordLength', 'Password must be 8 to 72 characters long', true],
        ['noToken', 'Token is not recognized', false],
        ['anything else', 'Token is not recognized', false],
    ])('stays on the page when the API answers %s', async (message, text, canSaveAgain) => {
        answer('put', { success: false, message });
        renderRestore();

        await save('new password', 'new password');

        expect(await screen.findByText(new RegExp(text))).toBeInTheDocument();
        expect(screen.queryByTestId('path')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(
            !canSaveAgain
        );
    });

    it('lets the user send another password after the API rejected the first', async () => {
        vi.mocked(Axios.put)
            .mockResolvedValueOnce({
                data: { success: false, message: 'passwordLength' },
            } as AxiosResponse)
            .mockResolvedValueOnce({ data: { success: true } } as AxiosResponse);
        renderRestore();

        await save('new password', 'new password');
        await screen.findByText(/Password must be 8 to 72/);
        await save('another password', 'another password');

        expect(await screen.findByTestId('path')).toHaveTextContent(/^\/$/);
        expect(Axios.put).toHaveBeenLastCalledWith(getResetTokenUrl(endpoint), {
            password: 'another password',
            token,
        });
    });

    it('links back to the login page', async () => {
        renderRestore();

        expect(await screen.findByRole('link', { name: 'Login' })).toHaveAttribute(
            'href',
            PATHS.LOGIN
        );
    });
});
