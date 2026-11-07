import { test, expect } from '@playwright/test';
import { apiHeaders, apiUrl, getApiToken } from './helpers/api';

// The API's answers are the user's data. A browser or proxy must not keep them, so they cannot be
// read back from a shared computer's cache after logout.
test.describe('API answers', () => {
    test('are never stored in a cache', async ({ request }) => {
        const token = await getApiToken(request);

        for (const path of [
            '/profile',
            '/customers?page=1&limit=10',
            '/invoices?page=1&limit=10',
        ]) {
            const response = await request.get(`${apiUrl}${path}`, { headers: apiHeaders(token) });

            expect(response.status(), path).toBe(200);
            expect(response.headers()['cache-control'], path).toBe('no-store');
        }
    });

    test('of the login are never stored in a cache', async ({ request }) => {
        const response = await request.post(`${apiUrl}/login`, {
            headers: apiHeaders(),
            data: { username: 'nobody@example.test', password: 'wrong password' },
        });

        expect(response.headers()['cache-control']).toBe('no-store');
    });
});
