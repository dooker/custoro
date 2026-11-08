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

    test('a reset link stops working when the user changes the password themselves', async ({
        request,
    }) => {
        const email = `pw-${tag()}@example.test`;

        await userWithPassword(request, email, 'old password 1');
        const session = (await login(request, email, 'old password 1')).token;
        const { token } = await nextPasswordLink(request, email, () => forgot(request, email));
        const changed = await json(
            put(
                request,
                '/profile',
                {
                    name: 'Reset test',
                    email,
                    password: 'new password 2',
                    currentPassword: 'old password 1',
                },
                session
            )
        );

        expect(changed.success).toBe(true);
        expect(
            await json(put(request, '/login/token', { token, password: 'link password 3' }))
        ).toEqual({ success: false, message: 'noToken' });
        expect((await login(request, email, 'new password 2')).success).toBe(true);
    });

    test('a link stops working when the user changes their email', async ({ request }) => {
        const email = `mail-${tag()}@example.test`;

        await userWithPassword(request, email, 'my password 1');
        const session = (await login(request, email, 'my password 1')).token;
        const { token } = await nextPasswordLink(request, email, () => forgot(request, email));
        const changed = await json(
            put(
                request,
                '/profile',
                {
                    name: 'Reset test',
                    email: `moved-${tag()}@example.test`,
                    currentPassword: 'my password 1',
                },
                session
            )
        );

        expect(changed.success).toBe(true);
        expect(
            await json(put(request, '/login/token', { token, password: 'link password 3' }))
        ).toEqual({ success: false, message: 'noToken' });
    });

    test('the link of a mistyped address stops working when the admin corrects it', async ({
        request,
    }) => {
        const mistyped = `typo-${tag()}@wrong.test`;
        const right = `right-${tag()}@example.test`;
        const user = { name: 'Reset test', discount: '0', offer: '0', role: 'user' };
        const { result, token } = await nextPasswordLink(request, mistyped, () =>
            json(post(request, '/user', { ...user, username: mistyped }, adminToken))
        );
        const corrected = await json(
            put(request, `/user/${result.insertId}`, { ...user, username: right }, adminToken)
        );

        expect(corrected.success).toBe(true);
        // Whoever got the email at the mistyped address cannot set the account's password
        expect(
            await json(put(request, '/login/token', { token, password: 'stranger pass 1' }))
        ).toEqual({ success: false, message: 'noToken' });
        expect((await login(request, right, 'stranger pass 1')).success).toBe(false);
    });

    test('a link still works after an admin edit that keeps the email', async ({ request }) => {
        const email = `keep-${tag()}@example.test`;
        const user = { discount: '0', offer: '0', role: 'user', username: email };
        const { result, token } = await nextPasswordLink(request, email, () =>
            json(post(request, '/user', { ...user, name: 'Reset test' }, adminToken))
        );

        await put(request, `/user/${result.insertId}`, { ...user, name: 'Renamed' }, adminToken);

        expect(
            await json(put(request, '/login/token', { token, password: 'kept link 1' }))
        ).toEqual({
            success: true,
        });
    });

    test('an email with an apostrophe or & logs in and gets reset links', async ({ request }) => {
        for (const email of [`o'brien-${tag()}@example.test`, `sales&co-${tag()}@example.test`]) {
            await userWithPassword(request, email, 'quote password 1');

            expect((await login(request, email, 'quote password 1')).success, email).toBe(true);

            const { token } = await nextPasswordLink(request, email, () => forgot(request, email));

            expect(
                await json(put(request, '/login/token', { token, password: 'quote pass 2' }))
            ).toEqual({ success: true });
            expect((await login(request, email, 'quote pass 2')).success, email).toBe(true);
        }
    });

    test('a link stops working when an admin changes only an accent of the email', async ({
        request,
    }) => {
        // users.username compares without accents: ana@ and ána@ are "the same" to the database,
        // but not the same mailbox
        const id = tag();
        const plain = `ana-${id}@example.test`;
        const accented = `ána-${id}@example.test`;
        const user = { name: 'Reset test', discount: '0', offer: '0', role: 'user' };
        const { result, token } = await nextPasswordLink(request, plain, () =>
            json(post(request, '/user', { ...user, username: plain }, adminToken))
        );
        const changed = await json(
            put(request, `/user/${result.insertId}`, { ...user, username: accented }, adminToken)
        );

        expect(changed.success).toBe(true);
        expect(
            await json(put(request, '/login/token', { token, password: 'accent pass 1' }))
        ).toEqual({ success: false, message: 'noToken' });
    });
});
