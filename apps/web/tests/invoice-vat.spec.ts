import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/login';

// Uses the demo invoices from apps/api/db/demo/demo-data.sql
const vatOnInvoice = async (page: Page, invoiceId: number) => {
    await page.goto(`/invoice/1/${invoiceId}/`);

    const vatRow = page.locator('tfoot tr', { hasText: 'VAT' });

    await expect(vatRow).toBeVisible();

    return vatRow.locator('td').nth(1);
};

test.beforeEach(async ({ page, request }) => {
    await login({ page, request });
});

test('charges VAT when the VAT number is only a placeholder', async ({ page }) => {
    // Invoice 1: customer "Sir Reginald Pompous" with VAT number "VAT-001", total 1899.96 at 24%
    await expect(await vatOnInvoice(page, 1)).toHaveText('455.99');
});

test('makes the invoice VAT-free for a foreign EU VAT number', async ({ page }) => {
    // Invoice 5: customer "Asteroid Accounting SIA" with a Latvian VAT number
    await expect(await vatOnInvoice(page, 5)).toHaveText('0.00');
});
