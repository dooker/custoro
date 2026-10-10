import { test, expect, type APIRequestContext } from '@playwright/test';
import { apiHeaders, apiUrl, getApiToken } from './helpers/api';
import { getRegularUser } from './helpers/login';

// Runs against the API with the E2E admin (E2E_USER) and a regular user (E2E_REGULAR_USER).
// Requests that would change data use ids that do not exist, so a broken check fails the test
// without deleting or changing a real account.
const missingId = 999999;

// Several tests change the regular user's profile, and one changes its password, so this
// file's tests run one after another instead of in parallel
test.describe.configure({ mode: 'default' });

type Method = 'get' | 'post' | 'put' | 'delete';

const call = (request: APIRequestContext, method: Method, path: string, token?: string) =>
    request[method](`${apiUrl}${path}`, {
        headers: apiHeaders(token),
        ...(method === 'get' ? {} : { data: {} }),
    });

// One route per protected router, plus the write routes that matter most
const protectedRoutes: [Method, string][] = [
    ['get', '/profile'],
    ['get', '/customers'],
    ['get', '/customer/1'],
    ['get', '/products'],
    ['get', '/product/1'],
    ['get', '/worksheets'],
    ['get', '/worksheet/1'],
    ['get', '/invoices'],
    ['get', '/invoice/last/'],
    ['get', '/search'],
    ['get', '/settings'],
    ['put', '/settings'],
    ['post', '/email'],
    ['put', `/pdf/${missingId}`],
    ['get', '/users'],
    ['get', '/user/1'],
];

const adminOnlyRoutes: [Method, string][] = [
    ['get', '/users'],
    ['get', '/user/1'],
    ['post', '/user'],
    ['put', `/user/${missingId}`],
    ['delete', `/user/${missingId}`],
    ['delete', `/user/avatar/${missingId}`],
];

test.describe('without a valid token', () => {
    for (const [method, path] of protectedRoutes) {
        test(`${method.toUpperCase()} ${path} needs a token`, async ({ request }) => {
            const response = await call(request, method, path);

            expect(response.status()).toBe(401);
            expect(await response.json()).toEqual({ success: false, message: 'auth.header' });
        });
    }

    test('a token that is not a JWT is refused', async ({ request }) => {
        const body = await (await call(request, 'get', '/users', 'not-a-jwt')).json();

        expect(body).toEqual({ success: false, message: 'invalid.token' });
    });

    test('a regular user cannot make themselves admin by editing the token', async ({
        request,
    }) => {
        const token = await getApiToken(request, getRegularUser());
        const [header, payload, signature] = token.split('.');
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
        const forgedPayload = Buffer.from(JSON.stringify({ ...claims, role: 'admin' })).toString(
            'base64url'
        );
        const forged = `${header}.${forgedPayload}.${signature}`;

        const body = await (await call(request, 'get', '/users', forged)).json();

        expect(body).toEqual({ success: false, message: 'invalid.token' });
    });
});

test.describe('admin-only routes', () => {
    for (const [method, path] of adminOnlyRoutes) {
        test(`${method.toUpperCase()} ${path} is forbidden for a regular user`, async ({
            request,
        }) => {
            const token = await getApiToken(request, getRegularUser());
            const response = await call(request, method, path, token);

            expect(response.status()).toBe(403);
            expect(await response.json()).toEqual({ success: false, message: 'forbidden' });
        });
    }

    test('an admin can list and read users', async ({ request }) => {
        const token = await getApiToken(request);

        const list = await (await call(request, 'get', '/users', token)).json();
        const single = await (await call(request, 'get', '/user/1', token)).json();

        expect(list.success).toBe(true);
        expect(list.resource.length).toBeGreaterThan(0);
        expect(single.success).toBe(true);
    });
});

test.describe('mail server settings', () => {
    const mailFields = ['host', 'port', 'username', 'password'];

    test('are not shown to a regular user', async ({ request }) => {
        const token = await getApiToken(request, getRegularUser());
        const body = await (await call(request, 'get', '/settings', token)).json();

        expect(body.success).toBe(true);
        for (const field of mailFields) {
            expect(body.data[0]).not.toHaveProperty(field);
        }
    });

    test('are shown to an admin, without the password', async ({ request }) => {
        const token = await getApiToken(request);
        const body = await (await call(request, 'get', '/settings', token)).json();

        expect(body.data[0]).toHaveProperty('host');
        expect(body.data[0]).not.toHaveProperty('password');
    });

    test('cannot be changed by a regular user', async ({ request }) => {
        const adminToken = await getApiToken(request);
        const userToken = await getApiToken(request, getRegularUser());
        const readHost = async () =>
            (await (await call(request, 'get', '/settings', adminToken)).json()).data[0].host;
        const hostBefore = await readHost();

        const response = await request.put(`${apiUrl}/settings`, {
            headers: apiHeaders(userToken),
            data: { host: 'smtp.attacker.example', username: 'attacker', password: 'x' },
        });

        expect((await response.json()).success).toBe(true);
        expect(await readHost()).toBe(hostBefore);
    });
});

test.describe('profile', () => {
    test('an update always applies to the caller, never to an id in the body', async ({
        request,
    }) => {
        const adminToken = await getApiToken(request);
        const userToken = await getApiToken(request, getRegularUser());
        const readProfile = async () =>
            (await (await call(request, 'get', '/profile', userToken)).json()).resource;
        const readAdmin = async () =>
            (await (await call(request, 'get', '/user/1', adminToken)).json()).data[0];
        const userBefore = await readProfile();
        const adminBefore = await readAdmin();

        try {
            const response = await request.put(`${apiUrl}/profile`, {
                headers: apiHeaders(userToken),
                data: {
                    id: adminBefore.id,
                    name: `${userBefore.name} (authorization test)`,
                    email: userBefore.email,
                    role: 'admin',
                },
            });

            expect((await response.json()).success).toBe(true);

            const userAfter = await readProfile();
            const adminAfter = await readAdmin();

            expect(userAfter.name).toBe(`${userBefore.name} (authorization test)`);
            expect(userAfter.role).toBe('user');
            expect(adminAfter.name).toBe(adminBefore.name);
            expect(adminAfter.username).toBe(adminBefore.username);
        } finally {
            await request.put(`${apiUrl}/profile`, {
                headers: apiHeaders(userToken),
                data: { name: userBefore.name, email: userBefore.email },
            });
        }
    });
});

test.describe('profile email and password', () => {
    const putProfile = (request: APIRequestContext, token: string, data: object) =>
        request.put(`${apiUrl}/profile`, { headers: apiHeaders(token), data });

    test("a user cannot take another user's email", async ({ request }) => {
        const regular = getRegularUser();
        const userToken = await getApiToken(request, regular);
        const admin = (
            await (await call(request, 'get', '/profile', await getApiToken(request))).json()
        ).resource;
        const name = (await (await call(request, 'get', '/profile', userToken)).json()).resource
            .name;

        for (const email of [admin.email, admin.email.toUpperCase()]) {
            const response = await putProfile(request, userToken, {
                name,
                email,
                currentPassword: regular.password,
            });

            expect(await response.json()).toEqual({ success: false, message: 'user.exists' });
        }

        const after = (await (await call(request, 'get', '/profile', userToken)).json()).resource;

        expect(after.email).toBe(regular.username);
    });

    test('changing the email or password needs the current password', async ({ request }) => {
        const regular = getRegularUser();
        const token = await getApiToken(request, regular);
        const name = (await (await call(request, 'get', '/profile', token)).json()).resource.name;
        const attempts = [
            { name, email: 'someone-else@quantumdesk.example' },
            { name, email: regular.username, password: 'AnotherPassword1' },
            {
                name,
                email: regular.username,
                password: 'AnotherPassword1',
                currentPassword: 'wrong-password',
            },
        ];

        for (const data of attempts) {
            expect(await (await putProfile(request, token, data)).json()).toEqual({
                success: false,
                message: 'currentPassword',
            });
        }

        // The password did not change
        await getApiToken(request, regular);
    });

    test('a password change ends other sessions and returns a new token', async ({ request }) => {
        const regular = getRegularUser();
        const newPassword = `${regular.password}-changed`;
        const otherSession = await getApiToken(request, regular);
        const token = await getApiToken(request, regular);
        const name = (await (await call(request, 'get', '/profile', token)).json()).resource.name;
        let freshToken: string | undefined;

        try {
            const body = await (
                await putProfile(request, token, {
                    name,
                    email: regular.username,
                    password: newPassword,
                    currentPassword: regular.password,
                })
            ).json();

            expect(body.success).toBe(true);
            freshToken = body.token as string;

            for (const old of [token, otherSession]) {
                expect(await (await call(request, 'get', '/profile', old)).json()).toEqual({
                    success: false,
                    message: 'invalid.token',
                });
            }

            expect(
                (await (await call(request, 'get', '/profile', freshToken)).json()).success
            ).toBe(true);
        } finally {
            // Put the original password back, whichever step failed
            const restoreWith =
                freshToken ?? (await getApiToken(request, { ...regular, password: newPassword }));

            await putProfile(request, restoreWith, {
                name,
                email: regular.username,
                password: regular.password,
                currentPassword: newPassword,
            });
        }

        await getApiToken(request, regular);
    });
});
