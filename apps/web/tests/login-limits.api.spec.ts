import { test, expect, type APIRequestContext } from '@playwright/test';
import { apiHeaders, apiUrl, getApiToken } from './helpers/api';
import { getRegularUser } from './helpers/login';

// Uses made-up accounts, so no real login is locked. Each run uses new names, because a blocked
// account stays blocked for 15 minutes.
// `from` is the client address the API sees; the dev and test setups trust X-Forwarded-For
// from private addresses (see TRUST_PROXY), which is how a test can log in from several places
const login = (request: APIRequestContext, username: string, from?: string) =>
    request.post(`${apiUrl}/login`, {
        headers: { ...apiHeaders(), ...(from ? { 'X-Forwarded-For': from } : {}) },
        data: { username, password: 'not-the-password' },
    });

test('repeated failed logins block the account for a while', async ({ request }) => {
    const run = Date.now();
    const blocked = `limit-${run}@nowhere.example`;

    for (let attempt = 1; attempt <= 10; attempt++) {
        const response = await login(request, blocked);

        expect(response.status(), `attempt ${attempt}`).toBe(200);
    }

    const refused = await login(request, blocked);

    expect(refused.status()).toBe(429);
    expect(Number(refused.headers()['retry-after'])).toBeGreaterThan(0);
    expect((await refused.json()).success).toBe(false);

    // Another account from the same address is not affected
    expect((await login(request, `other-${run}@nowhere.example`)).status()).toBe(200);
});

// These need an account that exists: the limit counts an existing account by its id, so every
// spelling the username column treats as the same account shares one budget. They use the demo
// cadet, but only from made-up client addresses (the first failure counter is per account and
// address), and end with a real login, which clears the cadet's counters for the other tests.
test.describe('an existing account', () => {
    const { username } = getRegularUser();
    const address = () => `203.0.113.${1 + Math.floor(Math.random() * 250)}`;

    test.afterEach(async ({ request }) => {
        await getApiToken(request, getRegularUser());
    });

    test('has one budget for every spelling of its email', async ({ request }) => {
        const [name, domain] = username.split('@');
        // The database ignores case, accents and trailing spaces when it compares usernames
        const spellings = [
            username,
            username.toUpperCase(),
            `${username} `,
            `${name.replace('a', 'á')}@${domain}`,
            `${name.replace('e', 'ë')}@${domain}`,
        ];
        const from = address();

        for (let attempt = 0; attempt < 10; attempt++) {
            const response = await login(request, spellings[attempt % spellings.length], from);

            expect(response.status(), `attempt ${attempt + 1}`).toBe(200);
        }

        for (const spelling of spellings) {
            const response = await login(request, spelling, from);

            expect(response.status(), JSON.stringify(spelling)).toBe(429);
        }
    });

    test('is not locked for its owner by someone else failing', async ({ request }) => {
        const stranger = address();

        for (let attempt = 0; attempt < 10; attempt++) {
            expect((await login(request, username, stranger)).status()).toBe(200);
        }

        expect((await login(request, username, stranger)).status()).toBe(429);

        // The owner, from another address, logs in with the right password
        const owner = await request.post(`${apiUrl}/login`, {
            headers: { ...apiHeaders(), 'X-Forwarded-For': address() },
            data: getRegularUser(),
        });

        expect((await owner.json()).success).toBe(true);
    });
});
