import { test, expect } from '@playwright/test';
import { apiHeaders, apiUrl, getApiToken } from './helpers/api';

// Creates invoices in the target database. The API has no way to delete invoices, so run this
// against a local or test database only.
test('invoices created at the same time get unique, consecutive numbers', async ({ request }) => {
    const token = await getApiToken(request);
    const headers = apiHeaders(token);
    const getLastNumber = async () => {
        const body = await (await request.get(`${apiUrl}/invoice/last/`, { headers })).json();

        return Number(body.data);
    };
    const count = 5;
    const lastBefore = await getLastNumber();

    const created = await Promise.all(
        Array.from({ length: count }, () =>
            request
                .post(`${apiUrl}/invoice`, { headers, data: { customerId: 1, items: [] } })
                .then((response) => response.json())
        )
    );

    for (const invoice of created) {
        expect(invoice.success).toBe(true);
    }

    const numbers = await Promise.all(
        created.map(async ({ lastId }) => {
            const body = await (
                await request.get(`${apiUrl}/invoice/${lastId}`, { headers })
            ).json();

            return Number(body.data[0].number);
        })
    );

    expect(new Set(numbers).size, `numbers ${numbers.join(', ')}`).toBe(count);
    expect([...numbers].sort((a, b) => a - b)).toEqual(
        Array.from({ length: count }, (_, index) => lastBefore + 1 + index)
    );
    expect(await getLastNumber()).toBe(lastBefore + count);
});
