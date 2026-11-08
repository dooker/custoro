import { test, expect, type APIRequestContext } from '@playwright/test';
import { apiHeaders, apiUrl, getApiToken } from './helpers/api';
import { ensurePasswordEmail, nextPasswordLink, noMailTo } from './helpers/mail';

// Password links end to end: the real API, database and email (read from the mail catcher of
// docker-compose.yml). Creates users with addresses of their own; dev database only.
const tag = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const post = (request: APIRequestContext, path: string, data: object, token?: string) =>
    request.post(`${apiUrl}${path}`, { headers: apiHeaders(token), data });

const put = (request: APIRequestContext, path: string, data: object, token?: string) =>
    request.put(`${apiUrl}${path}`, { headers: apiHeaders(token), data });

const json = async (response: ReturnType<typeof post>) => (await response).json();

let adminToken: string;

test.beforeAll(async ({ request }) => {
    adminToken = await getApiToken(request);
    await ensurePasswordEmail(request, adminToken);
});

/** A user made by the admin, with the password set from the emailed link */
const userWithPassword = async (request: APIRequestContext, email: string, password: string) => {
    const { result, token } = await nextPasswordLink(request, email, () =>
        json(
            post(
                request,
                '/user',
                { name: 'Reset test', username: email, discount: '0', offer: '0', role: 'user' },
                adminToken
            )
        )
    );

    expect(result).toMatchObject({ success: true, message: 'user.passwordLinkSent' });
    expect(await json(put(request, '/login/token', { token, password }))).toEqual({
        success: true,
    });

    return { id: Number(result.insertId) };
};

const login = async (request: APIRequestContext, username: string, password: string) =>
    json(post(request, '/login', { username, password }));

const forgot = (request: APIRequestContext, username: string) =>
    json(post(request, '/login/forgot', { username }));

test.describe('password links', () => {
    test('a new user sets a password with the emailed link, and the link works once', async ({
        request,
    }) => {
        const email = `new-${tag()}@example.test`;

        await userWithPassword(request, email, 'first password 1');

        expect((await login(request, email, 'first password 1')).success).toBe(true);
        // Used: the same link again finds nothing
        const { token } = await nextPasswordLink(request, email, () => forgot(request, email));
        await put(request, '/login/token', { token, password: 'second password 2' });
        expect(
            await json(put(request, '/login/token', { token, password: 'third pass 3' }))
        ).toEqual({ success: false, message: 'noToken' });
    });

    test('a reset link sets a new password and ends the sessions from before', async ({
        request,
    }) => {
        const email = `reset-${tag()}@example.test`;

        await userWithPassword(request, email, 'old password 1');
        const before = (await login(request, email, 'old password 1')).token;
        const { result, token } = await nextPasswordLink(request, email, () =>
            forgot(request, email)
        );

        expect(result).toEqual({ success: true });
        expect(await json(post(request, '/login/token', { token }))).toEqual({ success: true });
        expect(
            await json(put(request, '/login/token', { token, password: 'new password 2' }))
        ).toEqual({ success: true });
        expect((await login(request, email, 'old password 1')).success).toBe(false);
        expect((await login(request, email, 'new password 2')).success).toBe(true);

        const old = await request.get(`${apiUrl}/profile`, { headers: apiHeaders(before) });

        expect(await old.json()).toEqual({ success: false, message: 'invalid.token' });
    });

    test('an address without an account gets the same answer and no email', async ({ request }) => {
        const email = `nobody-${tag()}@example.test`;

        await noMailTo(request, email, async () =>
            expect(await forgot(request, email)).toEqual({ success: true })
        );
    });
});
