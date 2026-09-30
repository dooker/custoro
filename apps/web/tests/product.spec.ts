import { test, expect } from '@playwright/test';
import { login } from './helpers/login';
import { goAndCheck } from './helpers/navigation';

test.beforeEach(async ({ page, request }) => {
    await login({page, request});
});

test('login, go to products page', async ({ page }) => {
    const code = '0000-PW-123-TST'
    const name = 'Some Name For PlayWright Test'

    // Verify that we are on the home page after login
    await page.goto('/home');
    await expect(page).toHaveURL('/home');

    // Navigate to products page and verify that we are there
    await goAndCheck({page, key: 'products'})

    // Click on add product and verify that we are on the add product page
    await page.getByTestId('add-product').click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/product\/.*\/0\/?$/);

    // Fill in the product details and save
    await page.getByLabel("Code").fill(code)
    await page.getByLabel("Name").fill(name)
    await page.getByLabel("Price", { exact: true }).fill("100.00")
    await page.getByLabel("My Price").fill("50.00")
    await page.getByLabel("Comment").fill("PlayWright Playing Wright")

    // Save the product and verify that we are on the product details page
    await page.getByTestId('save-product').click();
    await expect(page).toHaveURL(/product\/.*\/.*\/?$/);

    // Verify that there is notification about successful save and that the product details are correct
    await expect(page.getByText(/^Saved/)).toBeVisible();

    // Go back to products page
    await goAndCheck({page, key: 'products'})

    // Search for the product and verify that it is visible in the search results
    await page.getByTestId('search-product').click();
    await page.getByTestId('search-input').fill(code)
    await expect(page.locator('.component.products')).toContainText(name);

    // Click on the product and verify that we are on the product details page
    await page.getByText(name, { exact: true }).first().click();
    await expect(page).toHaveURL(/product\/.*\/.*\/?$/);

    // Edit the product details and save
    const newCode = `${code} Edited`
    const newName = `${name} Edited`
    await page.getByLabel("Code").fill(newCode)
    await page.getByLabel("Name").fill(newName)

    // Save the product and verify that we are on the product details page
    await page.getByTestId('save-product').click();
    await page.reload();
    const codeValue = await page.getByLabel("Code").inputValue();
    const nameValue = await page.getByLabel("Name").inputValue();
    expect(codeValue).toBe(newCode);
    expect(nameValue).toBe(newName);

    // Delete the product and verify that we are back on the products page and that the product is no longer visible
    await page.getByTestId('delete-product').click();
    await page.getByTestId('confirm-button').click();
    await expect(page).toHaveURL(/products\/.*\/.*\/?$/);
    await expect(page.getByText(/^Deleted/)).toBeVisible();
    await expect(
        page.locator('.component.products').getByText(name)
    ).toHaveCount(0);
});
