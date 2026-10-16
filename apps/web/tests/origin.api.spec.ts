import { test, expect } from '@playwright/test';
import { apiUrl, getApiToken } from './helpers/api';

// The API serves one app and one database. The Origin header used to pick the database, so a
// request without it (curl, a health check) or from another site ended in a 500; now it only
// decides whether the response carries CORS headers for a browser.
test.describe('the Origin header', () => {
    test('is not needed', async ({ request }) => {
        const token = await getApiToken(request);

        const response = await request.get(`${apiUrl}/profile`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        expect(response.status()).toBe(200);
        expect((await response.json()).success).toBe(true);
    });

    test('of another site gets an answer without CORS headers, not an error', async ({
        request,
    }) => {
        const token = await getApiToken(request);
        const origin = 'https://other-site.example';

        for (const path of ['/', '/profile']) {
            const response = await request.get(`${apiUrl}${path}`, {
                headers: { Origin: origin, Authorization: `Bearer ${token}` },
            });

            expect(response.status(), path).toBe(200);
            expect(response.headers()['access-control-allow-origin'], path).toBeUndefined();
        }
    });

    test("of the app is allowed to read the answer", async ({ request }) => {
        const origin = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
        const response = await request.get(`${apiUrl}/`, { headers: { Origin: origin } });

        expect(response.status()).toBe(200);
        expect(response.headers()['access-control-allow-origin']).toBe(origin);
    });
});
