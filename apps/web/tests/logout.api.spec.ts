import { test, expect } from '@playwright/test';
import { apiHeaders, apiUrl, getApiToken } from './helpers/api';

// Logging out ends the session in the API, not only in the browser: the token, and the account's
// tokens on other devices, are refused from then on. This logs the test admin out everywhere, so
// it runs on its own (--workers=1, as CI does) and other files log in again for themselves.
test('logging out ends every session of the account', async ({ request }) => {
    const first = await getApiToken(request);
    const second = await getApiToken(request);

    for (const token of [first, second]) {
        const profile = await request.get(`${apiUrl}/profile`, { headers: apiHeaders(token) });

        expect((await profile.json()).success).toBe(true);
    }

    const logout = await request.post(`${apiUrl}/login/logout`, { headers: apiHeaders(first) });

    expect(await logout.json()).toEqual({ success: true });

    for (const token of [first, second]) {
        const profile = await request.get(`${apiUrl}/profile`, { headers: apiHeaders(token) });

        expect(await profile.json()).toEqual({ success: false, message: 'invalid.token' });
    }

    // A new login works
    const fresh = await getApiToken(request);
    const profile = await request.get(`${apiUrl}/profile`, { headers: apiHeaders(fresh) });

    expect((await profile.json()).success).toBe(true);
});

test('logging out needs a token', async ({ request }) => {
    const response = await request.post(`${apiUrl}/login/logout`, { headers: apiHeaders() });

    expect(response.status()).toBe(401);
});
