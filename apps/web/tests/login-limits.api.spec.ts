import { test, expect, type APIRequestContext } from '@playwright/test';
import { apiHeaders, apiUrl } from './helpers/api';

// Uses made-up accounts, so no real login is locked. Each run uses new names, because a blocked
// account stays blocked for 15 minutes.
const login = (request: APIRequestContext, username: string) =>
    request.post(`${apiUrl}/login`, {
        headers: apiHeaders(),
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
