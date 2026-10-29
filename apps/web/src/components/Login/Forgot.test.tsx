import { fireEvent, screen } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Axios } from '../../Axios';
import { renderScreen } from '../../test/renderScreen';
import { getLoginUrl } from '../../utils/auth';
import { endpoint, PATHS, RESOURCE } from '../../variables';
import Forgot from './Forgot';

const auth = vi.hoisted(() => ({ setErrorMessage: vi.fn() }));

vi.mock('../../Axios', () => ({ Axios: { post: vi.fn(), put: vi.fn() } }));
vi.mock('../../contexts/Auth', () => ({ tokenName: 'loginToken', useAuth: () => auth }));

const renderForgot = () => renderScreen(<Forgot />, { path: PATHS.FORGOT });

const send = async (username: string) => {
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: username } });
    fireEvent.click(screen.getByRole('button', { name: 'Send email' }));
};

beforeEach(() => {
    vi.resetAllMocks();
});

describe('Forgot', () => {
    it('asks for the reset email and says it was sent', async () => {
        vi.mocked(Axios.post).mockResolvedValue({ data: { success: true } } as AxiosResponse);
        renderForgot();

        await send('cadet@example.test');

        expect(
            await screen.findByText(
                'We sent an email to your email address. Please follow the instructions there'
            )
        ).toBeInTheDocument();
        expect(Axios.post).toHaveBeenCalledWith(getLoginUrl(endpoint, RESOURCE.FORGOT), {
            username: 'cadet@example.test',
        });
        expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute('href', PATHS.LOGIN);
    });

    it('shows a refusal instead of the confirmation', async () => {
        vi.mocked(Axios.post).mockResolvedValue({
            data: { success: false, message: 'Try again later' },
        } as AxiosResponse);
        renderForgot();

        await send('cadet@example.test');

        expect(await screen.findByText('Try again later')).toBeInTheDocument();
        expect(screen.queryByText(/We sent an email/)).not.toBeInTheDocument();
    });

    it('shows a failed request and tells the session', async () => {
        vi.mocked(Axios.post).mockRejectedValue(new AxiosError('Network Error'));
        renderForgot();

        await send('cadet@example.test');

        expect(await screen.findByText('Network Error')).toBeInTheDocument();
        expect(auth.setErrorMessage).toHaveBeenCalledWith('Network Error');
    });

    it.each([
        ['an empty address', '', 'Username is required'],
        ['an address that is not an email', 'captain', 'Email format is incorrect'],
    ])('sends nothing for %s', async (_name, username, message) => {
        renderForgot();

        await send(username);

        expect(await screen.findByText(message)).toBeInTheDocument();
        expect(Axios.post).not.toHaveBeenCalled();
    });

    it('links back to the login page', async () => {
        renderForgot();

        expect(await screen.findByRole('link', { name: 'Login' })).toHaveAttribute(
            'href',
            PATHS.LOGIN
        );
    });
});
