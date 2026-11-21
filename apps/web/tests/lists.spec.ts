import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { login } from './helpers/login';
import { apiHeaders, apiUrl, getApiToken } from './helpers/api';

// The lists in the browser, as the admin (the owner of the dev install): the page's own header,
// the search in the address, pages, rows as links, delete, a failed load, and the two issues of
// release 5.2.0 (#41 language switcher, #42 Companies page). It creates products and a company, so
// run it on the dev database only; the products are deleted again.

const listRows = (page: Page, resource: string) =>
    page.locator(`section.component.${resource} tbody tr`);

const heading = (page: Page) => page.getByRole('heading', { level: 1 });

// Products whose code and name carry one tag, so a search for it finds only them
const createProducts = async (request: APIRequestContext, token: string, tag: string, count: number) => {
    const ids: number[] = [];

    for (let index = 1; index <= count; index++) {
        const number = String(index).padStart(2, '0');
        const response = await request.post(`${apiUrl}/product`, {
            headers: apiHeaders(token),
            data: {
                code: `L-${tag}-${number}`,
                name: `List ${tag} ${number}`,
                price: '10',
                discountPrice: '0',
                unit: 'pc',
            },
        });
        const body = await response.json();

        expect(body.success, `product ${number}`).toBe(true);
        ids.push(body.insertId);
    }

    return ids;
};

test.beforeEach(async ({ page, request }) => {
    await login({ page, request });
});

test('Home keeps its own title and has no buttons once its small lists have loaded', async ({
    page,
}) => {
    await page.goto('/home/');

    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
        'Latest Worksheets',
        'Latest Invoices',
        'Latest Products',
        'Latest Customers',
    ]);
    await expect(listRows(page, 'customers').first()).toBeVisible();
    // The last small list to load used to win: "Invoices" with Search and Add
    await expect(heading(page)).toHaveText('Dashboard');
    await expect(page.getByRole('banner').getByRole('button')).toHaveCount(0);
    await expect(page.getByTestId('search-button')).toHaveCount(0);

    // A small list's row leads to its record, five rows at most
    await expect(listRows(page, 'products')).toHaveCount(5);
    await listRows(page, 'customers').first().getByRole('link').first().click();
    await expect(page).toHaveURL(/\/customer\/1\/\d+\/$/);
    await expect(heading(page)).toHaveText(/^Customer - /);
});

test('the customer page keeps its title with its small lists below', async ({ page }) => {
    // Demo customer 1, "Sir Reginald Pompous", has invoices
    await page.goto('/customer/1/1/');

    await expect(page.locator('section.component.invoices tbody tr').first()).toBeVisible();
    await expect(heading(page)).toHaveText('Customer - Sir Reginald Pompous');
    await expect(page.getByRole('banner').getByRole('button', { name: 'Delete' })).toBeVisible();
});

test('a search starts on page 1, lives in the address, and survives pages, reload, back and delete', async ({
    page,
    request,
}) => {
    test.setTimeout(90_000);

    const tag = Date.now().toString(36);
    const token = await getApiToken(request);
    const ids = await createProducts(request, token, tag, 17);

    try {
        // From page 2 of the whole list
        await page.goto('/products/2/');
        await expect(listRows(page, 'products')).toHaveCount(15);
        await page.getByTestId('search-button').click();
        await page.getByTestId('search-input').fill(tag);

        // ... to page 1 of the matches: 15 rows here, 2 on page 2
        await expect(page).toHaveURL(`/products/1/?q=${tag}`);
        await expect(listRows(page, 'products')).toHaveCount(15);
        await expect(listRows(page, 'products').first()).toContainText(tag);

        await page.getByRole('button', { name: 'Go to page 2' }).click();
        await expect(page).toHaveURL(`/products/2/?q=${tag}`);
        await expect(listRows(page, 'products')).toHaveCount(2);

        // Reload: the box is open with the word, same rows
        await page.reload();
        await expect(page.getByTestId('search-input')).toHaveValue(tag);
        await expect(listRows(page, 'products')).toHaveCount(2);

        await page.goBack();
        await expect(page).toHaveURL(`/products/1/?q=${tag}`);
        await expect(listRows(page, 'products')).toHaveCount(15);

        // Every cell of a row is a link to the product, the first one reachable by Tab
        const row = listRows(page, 'products').first();
        const links = row.getByRole('link');

        // (every cell but the last, which holds the delete button)
        await expect(links).toHaveCount((await row.getByRole('cell').count()) - 1);
        await expect(links.first()).toHaveAttribute('href', /^\/product\/1\/\d+\/$/);
        await expect(links.first()).toHaveAttribute('tabindex', '0');
        await expect(links.nth(1)).toHaveAttribute('tabindex', '-1');
        await row.getByRole('link').nth(2).click();
        await expect(page).toHaveURL(/\/product\/1\/\d+\/$/);
        await page.goBack();

        // Deleting on page 2 stays there while it has rows ...
        await page.goto(`/products/2/?q=${tag}`);

        const deleteFirst = async () => {
            await listRows(page, 'products').first().getByRole('button', { name: 'Delete' }).click();
            await page.getByTestId('confirm-button').click();
            await expect(page.getByText(/^Deleted/)).toBeVisible();
        };

        await deleteFirst();
        await expect(page).toHaveURL(`/products/2/?q=${tag}`);
        await expect(listRows(page, 'products')).toHaveCount(1);

        // ... and after its last row goes to page 1, the search kept
        await deleteFirst();
        await expect(page).toHaveURL(`/products/1/?q=${tag}`);
        await expect(listRows(page, 'products')).toHaveCount(15);
        await expect(page.getByRole('button', { name: 'Go to page 2' })).toHaveCount(0);

        // Closing the search shows the whole list again, from page 1
        await page.getByTestId('search-button').click();
        await expect(page).toHaveURL('/products/1/');
    } finally {
        for (const id of ids) {
            await request.delete(`${apiUrl}/product/${id}/`, { headers: apiHeaders(token) });
        }
    }
});

test('a list that cannot be loaded says so instead of "No entries"', async ({ page }) => {
    await page.route(
        (url) => url.port === new URL(apiUrl).port && url.pathname.startsWith('/customers'),
        (route) => route.fulfill({ status: 500, body: 'boom' })
    );
    await page.goto('/customers/1/');

    await expect(page.getByRole('alert')).toHaveText(/The list could not be loaded/, {
        timeout: 15_000,
    });
    await expect(page.getByText('No entries')).toHaveCount(0);
    await expect(heading(page)).toHaveText('Customers');
});

// Issue 41
test('the language switcher changes the language on the first click after a reload', async ({
    page,
}) => {
    await page.evaluate(() => localStorage.setItem('language', 'et'));
    await page.reload();
    await expect(page.getByTestId('main-link-products')).toHaveText('Tooted');

    await page.getByText('English', { exact: true }).click();

    await expect(page.getByTestId('main-link-products')).toHaveText('Products');
    await expect(heading(page)).toHaveText('Dashboard');
    expect(await page.evaluate(() => localStorage.getItem('language'))).toBe('en');

    await page.reload();
    await expect(page.getByTestId('main-link-products')).toHaveText('Products');
});

// Issue 42
test('the owner finds, opens, renames and switches a company off and on', async ({
    page,
    request,
}) => {
    const tag = Date.now().toString(36);
    const name = `E2E Company ${tag}`;
    const token = await getApiToken(request);
    const created = await (
        await request.post(`${apiUrl}/tenants`, {
            headers: apiHeaders(token),
            data: { name, adminEmail: `e2e-company-${tag}@example.test`, adminName: 'E2E' },
        })
    ).json();

    expect(created.success).toBe(true);

    await page.goto('/tenants/1/');
    await expect(heading(page)).toHaveText('Companies');
    await page.getByTestId('search-button').click();
    await page.getByTestId('search-input').fill(tag);
    await expect(page).toHaveURL(`/tenants/1/?q=${tag}`);
    await expect(listRows(page, 'tenants')).toHaveCount(1);
    await expect(listRows(page, 'tenants').first()).toContainText('Active');

    await listRows(page, 'tenants').first().getByRole('link').first().click();
    await expect(page).toHaveURL(`/tenant/1/${created.insertId}/`);
    await expect(heading(page)).toHaveText(`Company - ${name}`);

    // Rename
    await page.getByRole('textbox', { name: 'Name' }).fill(`${name} renamed`);
    await page.getByTestId('save-tenant').click();
    await expect(page.getByText(/^Saved/)).toBeVisible();
    await expect(heading(page)).toHaveText(`Company - ${name} renamed`);

    // Off (red) and on again
    const switchButton = page.getByTestId('switch-tenant');

    await expect(switchButton).toHaveText('Switch off');
    await expect(switchButton).toHaveClass(/tertiary/);
    await switchButton.click();
    await expect(switchButton).toHaveText('Switch on');
    await expect(page.getByTestId('tenant-facts')).toContainText('Switched off');
    await switchButton.click();
    await expect(switchButton).toHaveText('Switch off');

    // Back to the list: the new name is there
    await page.getByRole('button', { name: 'Go Back' }).click();
    await expect(page).toHaveURL('/tenants/1/');
    await page.getByTestId('search-button').click();
    await page.getByTestId('search-input').fill(`${tag} renamed`);
    await expect(listRows(page, 'tenants')).toHaveCount(1);
});
