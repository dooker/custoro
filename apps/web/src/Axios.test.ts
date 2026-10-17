import type { AxiosAdapter } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Axios } from './Axios';
import { tokenName } from './contexts/Auth';
import { sessionEndedEvent } from './variables';

// An adapter that answers with `data` and HTTP 200, as the API does for a refused token
const answer =
    (data: unknown): AxiosAdapter =>
    async (config) => ({ data, status: 200, statusText: 'OK', headers: {}, config });

const listener = vi.fn();

beforeEach(() => {
    window.addEventListener(sessionEndedEvent, listener);
});

afterEach(() => {
    window.removeEventListener(sessionEndedEvent, listener);
    listener.mockClear();
    localStorage.clear();
});

describe('session ending', () => {
    it.each(['session.expired', 'invalid.token'])(
        'announces %s while a token is stored',
        async (message) => {
            localStorage.setItem(tokenName, 'old-token');

            await Axios.get('/customers/', { adapter: answer({ success: false, message }) });

            expect(listener).toHaveBeenCalledTimes(1);
        }
    );

    it('stays quiet when no token is stored, as on the login form', async () => {
        await Axios.post(
            '/login/',
            {},
            { adapter: answer({ success: false, message: 'invalid.token' }) }
        );

        expect(listener).not.toHaveBeenCalled();
    });

    it('stays quiet for successful answers and for other failures', async () => {
        localStorage.setItem(tokenName, 'token');

        await Axios.get('/customers/', { adapter: answer({ success: true, resource: [] }) });
        await Axios.get('/settings/', {
            adapter: answer({ success: false, message: 'forbidden' }),
        });
        await Axios.get('/pdf/', { adapter: answer('%PDF-1.7') });

        expect(listener).not.toHaveBeenCalled();
    });

    it('still returns the response to the caller', async () => {
        localStorage.setItem(tokenName, 'old-token');

        const { data } = await Axios.get('/customers/', {
            adapter: answer({ success: false, message: 'session.expired' }),
        });

        expect(data).toEqual({ success: false, message: 'session.expired' });
    });

    it('sends the stored token with each request', async () => {
        localStorage.setItem(tokenName, 'abc');
        let sent: unknown;

        await Axios.get('/customers/', {
            adapter: async (config) => {
                sent = config.headers.Authorization;

                return {
                    data: { success: true },
                    status: 200,
                    statusText: 'OK',
                    headers: {},
                    config,
                };
            },
        });

        expect(sent).toBe('Bearer abc');
    });
});
