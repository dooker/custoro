import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { login } from './helpers/login';
import { apiHeaders, apiUrl, getApiToken } from './helpers/api';

// The main way the app is used, in the browser, as the admin: a new customer, a worksheet for
// them, the worksheet billed on a new invoice, the PDF, the invoice marked as paid, and the
// export for the accountant. It creates a customer, a product and an invoice (the API cannot
// delete invoices), so run it on the dev database only. Sending the email needs a mail server
// and is tested in the API suite instead.
test('a customer is billed for their worksheet, paid, and exported', async ({ page, request }) => {
    test.setTimeout(60_000);

    const tag = Date.now().toString(36);
    const customerName = `Journey Õnne ${tag} OÜ`;
    const productName = `Journey hour ${tag}`;
    const token = await getApiToken(request);

    // The product comes from the API: the products page has its own test (product.spec.ts)
    const product = await request.post(`${apiUrl}/product`, {
        headers: apiHeaders(token),
        data: {
            code: `J-${tag}`,
            name: productName,
            price: '33.33',
            discountPrice: '30',
            unit: 'hour',
        },
    });

    expect((await product.json()).success).toBe(true);

    await login({ page, request });

    // 1. The customer, on the customer form
    await page.goto('/customers/1/');
    await page.getByTestId('add-customer').click();
    await page.getByRole('textbox', { name: 'Name / Company' }).fill(customerName);
    await page.getByRole('textbox', { name: 'Reg number' }).fill('12345678');
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('onne@example.test');
    await page.getByRole('button', { name: 'Save' }).click();
    // The new customer form is /customer/1/0/; saving moves to the customer's id
    await expect(page).toHaveURL(/\/customer\/1\/[1-9]\d*\/?$/);

    const customerId = Number(/\/customer\/1\/(\d+)/.exec(page.url())?.[1]);

    // 2. A worksheet for them: 1.5 hours
    await page.goto('/worksheet/1/0/');
    await page.getByRole('combobox', { name: 'Customer' }).fill(customerName);
    await page.getByRole('option', { name: customerName }).click();
    await page.getByRole('combobox', { name: 'Product' }).fill(productName);
    await page.getByRole('option', { name: new RegExp(productName) }).click();
    await page.getByRole('spinbutton', { name: 'Quantity' }).fill('1.5');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page).not.toHaveURL(/\/worksheet\/1\/0\/?$/);

    // 3. Billed on a new invoice from the customer's worksheets
    await page.goto(`/worksheets/1/${customerId}/1/`);
    await page
        .getByRole('row', { name: new RegExp(productName) })
        .getByRole('checkbox')
        .check();
    await page.getByRole('button', { name: 'Add to invoice' }).click();

    const created = page.waitForResponse(
        (response) => response.request().method() === 'POST' && /\/invoice\/?$/.test(response.url())
    );

    await page.getByText(/^New nr /).click();

    const { success, lastId: invoiceId } = await (await created).json();

    expect(success).toBe(true);

    // 4. The invoice: 1.5 x 33.33 = 49.995 is 50.00, and the totals add up
    await page.goto(`/invoice/1/${invoiceId}/`);

    const line = page.getByRole('row', { name: new RegExp(productName) });

    await expect(line.getByRole('cell').nth(4)).toHaveText('33.33');
    await expect(line).toContainText('50.00');
    await expect(
        page
            .getByRole('row', { name: /^Total / })
            .getByRole('cell')
            .nth(1)
    ).toHaveText('50.00');
    await expect(page.getByRole('row', { name: /^VAT / }).getByRole('cell').nth(1)).toHaveText(
        '12.00'
    );
    await expect(
        page
            .getByRole('row', { name: /^To pay / })
            .getByRole('cell')
            .nth(1)
    ).toHaveText('62.00');

    // 5. The PDF, and its public link opens without a login
    await page.getByRole('button', { name: 'Generate PDF' }).click();
    await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeVisible();

    const invoice = await (
        await request.get(`${apiUrl}/invoice/${invoiceId}`, { headers: apiHeaders(token) })
    ).json();
    const pdf = await request.get(`${apiUrl}/pdf/${invoice.data[0].hash}`);

    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

    // 6. Paid: the invoice is locked
    await page.getByRole('button', { name: 'Mark as paid' }).click();
    await page.getByTestId('confirm-button').click();
    await expect(page.getByRole('button', { name: 'Mark as paid' })).toBeDisabled();
    await expect(page.getByRole('banner').getByRole('button', { name: 'Save' })).toHaveCount(0);
    await expect(line.getByRole('spinbutton')).toHaveCount(0);

    // 7. The accountant's export has it, with the same amounts, as paid
    const today = new Date();
    const day = (offset: number) =>
        new Date(today.getTime() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await page.goto('/settings/export/');
    await page.locator('input[name="from"]').fill(day(-1));
    await page.locator('input[name="to"]').fill(day(1));

    const download = page.waitForEvent('download');

    await page.getByTestId('export-invoices').click();

    const csv = fs.readFileSync(await (await download).path(), 'utf8');
    const row = csv.split('\r\n').find((text) => text.includes(customerName));

    expect(row).toContain(`;${customerName};12345678;;50,00;24;12,00;62,00;yes;`);
});
