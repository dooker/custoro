import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { login } from './helpers/login';
import { apiHeaders, apiUrl, getApiToken } from './helpers/api';

// The lists in the browser, as the admin (the owner of the dev install): the page's own header,
// the search in the address, pages, rows as links, delete, a failed load, and the two issues of
// release 5.2.0 (#41 language switcher, #42 Companies page). It creates products and one test
// company, so run it on the dev database only; the products are deleted again, the company is
// reused by every later run.

const listRows = (page: Page, resource: string) =>
    page.locator(`section.component.${resource} tbody tr`);

const heading = (page: Page) => page.getByRole('heading', { level: 1 });

// A list shows as many rows as fit on the screen. These windows fit 15 rows (the table starts at
// 98 px, a row is 41, its head 40.5, the footer 49 and the margin 12; 15 rows need 815 to 855
// px, 835 is in the middle) and the minimum of 5.
const fifteenRows = { width: 1280, height: 835 };
const fiveRows = { width: 1280, height: 300 };

// Products whose code and name carry one tag, so a search for it finds only them
const createProducts = async (
    request: APIRequestContext,
    token: string,
    tag: string,
    count: number
) => {
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

// The products and users a test made, deleted after it even when it failed or timed out (a
// finally block in the test cannot: its request context is closed by then)
let madeProducts: number[] = [];
let madeUsers: number[] = [];

test.afterEach(async ({ request }) => {
    if (madeProducts.length || madeUsers.length) {
        const token = await getApiToken(request);

        for (const id of madeProducts) {
            await request.delete(`${apiUrl}/product/${id}/`, { headers: apiHeaders(token) });
        }

        for (const id of madeUsers) {
            await request.delete(`${apiUrl}/user/${id}/`, { headers: apiHeaders(token) });
        }

        madeProducts = [];
        madeUsers = [];
    }
});

test.beforeEach(async ({ page, request }) => {
    await login({ page, request });
});

test('Home keeps its own title and has no buttons once its small lists have loaded', async ({
    page,
}) => {
    await page.goto('/home/');

    // In the menu's order
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
        'Latest Products',
        'Latest Customers',
        'Latest Worksheets',
        'Latest Invoices',
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
    madeProducts = await createProducts(request, token, tag, 17);
    await page.setViewportSize(fifteenRows);

    // From page 2 of the whole list
    await page.goto('/products/2/');
    await expect(listRows(page, 'products')).toHaveCount(15);
    await page.getByTestId('search-button').click();
    await page.getByTestId('search-input').fill(tag);

    // ... to page 1 of the matches: 15 rows here, 2 on page 2
    await expect(page).toHaveURL(`/products/1/?q=${tag}`);
    await expect(listRows(page, 'products')).toHaveCount(15);
    await expect(listRows(page, 'products').first()).toContainText(tag);

    await page.getByRole('link', { name: 'Go to page 2' }).click();
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
    await expect(links.first()).toHaveAttribute(
        'href',
        new RegExp(`^/product/1/\\d+/\\?q=${tag}$`)
    );
    await expect(links.first()).toHaveAttribute('tabindex', '0');
    await expect(links.nth(1)).toHaveAttribute('tabindex', '-1');
    await row.getByRole('link').nth(2).click();
    // The product carries the list's search, and Go Back returns to the same rows
    await expect(page).toHaveURL(new RegExp(`/product/1/\\d+/\\?q=${tag}$`));
    await page.getByRole('button', { name: 'Go Back' }).click();
    await expect(page).toHaveURL(`/products/1/?q=${tag}`);
    await expect(listRows(page, 'products')).toHaveCount(15);

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
    await expect(page.getByRole('link', { name: 'Go to page 2' })).toHaveCount(0);

    // Closing the search shows the whole list again, from page 1
    await page.getByTestId('search-button').click();
    await expect(page).toHaveURL('/products/1/');
});

test('pages: past the end, which rows, page links, back to the top, rows that fit the window', async ({
    page,
    request,
}) => {
    test.setTimeout(90_000);

    // 31 products of its own, found by their tag: 3 pages of 15, 7 of 5, whatever else the
    // database holds (CI starts with the demo data only)
    const tag = Date.now().toString(36);
    const token = await getApiToken(request);

    madeProducts = await createProducts(request, token, tag, 31);
    await page.setViewportSize(fifteenRows);

    const rows = listRows(page, 'products');
    const range = page.getByTestId('list-range');
    const at = (number: number, extra = '') => `/products/${number}/?q=${tag}${extra}`;

    // A page past the end shows the last page, and the address follows
    await page.goto(at(999));
    await expect(page).toHaveURL(at(3));
    await expect(rows).toHaveCount(1);
    await expect(range).toHaveText('31–31 of 31');
    await expect(page.getByText('No entries')).toHaveCount(0);

    // Page 1: which rows of how many, and the page numbers are links with first and last
    await page.goto(at(1));
    await expect(range).toHaveText('1–15 of 31');
    await expect(page.getByRole('link', { name: 'Go to page 2' })).toHaveAttribute('href', at(2));
    await expect(page.getByRole('link', { name: 'Go to last page' })).toHaveAttribute(
        'href',
        at(3)
    );
    // No rows-per-page choice: the rows fit the window, and the page does not scroll
    await expect(page.getByTestId('page-size')).toHaveCount(0);
    expect(
        await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
    ).toBeLessThanOrEqual(0);

    // A smaller window: 5 rows (the fewest a list shows), from the first row seen
    await page.setViewportSize(fiveRows);
    await expect(range).toHaveText('1–5 of 31');
    await expect(rows).toHaveCount(5);

    // Another page starts at the top, not at the page numbers under the last row
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.getByRole('link', { name: 'Go to page 2' }).click();
    await expect(page).toHaveURL(at(2));
    await expect(range).toHaveText('6–10 of 31');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    // Resizing keeps the first row seen: row 16 is on page 2 of 15 and on page 4 of 5
    await page.setViewportSize(fifteenRows);
    await page.goto(at(2));
    await expect(range).toHaveText('16–30 of 31');
    await page.setViewportSize(fiveRows);
    await expect(page).toHaveURL(at(4));
    await expect(range).toHaveText('16–20 of 31');
    await page.setViewportSize(fifteenRows);
    await expect(page).toHaveURL(at(2));
    await expect(range).toHaveText('16–30 of 31');

    // An address from 5.2.0 with its rows per page: the size is ignored
    await page.goto(at(1, '&size=30'));
    await expect(range).toHaveText('1–15 of 31');
});

// What the row-height test needs and a fresh database (CI: the demo data) does not have: a paid
// invoice (the lock) next to an open one, a customer name too long for its column, and worksheets
// of one customer, one on the paid invoice and one open (a checkbox). Invoices cannot be deleted,
// so they are made once and found again by every later run.
const rowsCustomer = `E2E Lists rows ${'with a name far too long for its column '.repeat(3)}OÜ`;

const listRowsCustomer = async (request: APIRequestContext, token: string) => {
    const call = async (method: 'get' | 'post' | 'put', path: string, data?: object) =>
        (
            await request[method](`${apiUrl}${path}`, {
                headers: apiHeaders(token),
                ...(data ? { data } : {}),
            })
        ).json();
    const found = await call(
        'get',
        `/customers/?keyword=${encodeURIComponent('E2E Lists rows')}&page=1&limit=10`
    );
    const existing = (found.resource as { id: number; name: string }[]).find(
        ({ name }) => name === rowsCustomer
    );

    if (existing) {
        return existing.id;
    }

    const customer = await call('post', '/customer', {
        name: rowsCustomer,
        contact: 'E2E',
        regNumber: '',
        vatNumber: '',
        phone: '',
        phone2: '',
        address: '',
        email: '',
        invoiceEmail: '',
        www: '',
        paymentPeriod: 14,
        additionalInfo: '',
        shippingInfo: '',
        department: '',
    });
    const product = await call('post', '/product', {
        code: `E2E-ROWS-${Date.now().toString(36)}`,
        name: 'E2E Lists rows product',
        price: '10',
        discountPrice: '0',
        unit: 'pc',
    });

    expect(customer, 'the rows customer').toMatchObject({ success: true });
    expect(product, 'the rows product').toMatchObject({ success: true });

    const sheets: number[] = [];

    for (let index = 0; index < 2; index++) {
        const sheet = await call('post', '/worksheet', {
            customer: customer.insertId,
            product_id: product.insertId,
            quantity: 1,
        });

        expect(sheet, 'a worksheet').toMatchObject({ success: true });
        sheets.push(sheet.insertId);
    }

    // Paid, with the first worksheet on it; the second worksheet stays open
    const paid = await call('post', '/invoice', {
        customerId: customer.insertId,
        items: [{ worksheetId: sheets[0], productId: product.insertId, quantity: 1 }],
    });
    const open = await call('post', '/invoice', {
        customerId: customer.insertId,
        items: [{ productId: product.insertId, quantity: 1 }],
    });

    expect(paid, 'the paid invoice').toMatchObject({ success: true });
    expect(open, 'the open invoice').toMatchObject({ success: true });
    expect(await call('put', `/invoice/paid/${paid.lastId}`), 'paid').toMatchObject({
        success: true,
    });

    return customer.insertId as number;
};

const rowHeights = (page: Page, resource: string) =>
    listRows(page, resource).evaluateAll((rows) =>
        rows.map((row) => Math.round(row.getBoundingClientRect().height))
    );

test('every row of every list is as high (41 px), so the rows fit the window exactly', async ({
    page,
    request,
}) => {
    test.setTimeout(90_000);

    const token = await getApiToken(request);
    const customer = await listRowsCustomer(request, token);
    const tag = Date.now().toString(36);
    // A user with a picture (the default one) and a name and email too long for their columns
    const user = await (
        await request.post(`${apiUrl}/user`, {
            headers: apiHeaders(token),
            data: {
                name: `E2E Lists rows ${'person with a long name '.repeat(2)}${tag}`,
                // Near the 254 characters the API allows (Copilot review of PR 47)
                username: `${'a-very-long-email-'.repeat(3)}${tag}@${'very-long-subdomain.'.repeat(8)}example.test`,
                discount: 0,
                offer: 0,
                role: 'user',
            },
        })
    ).json();

    expect(user, 'the long user').toMatchObject({ success: true });
    madeUsers.push(user.insertId);
    await page.setViewportSize(fifteenRows);

    const search = (path: string, word: string) => `${path}?q=${encodeURIComponent(word)}`;
    const none = async () => {};

    // What made a row higher, each one made sure of: the paid lock next to an open invoice, long
    // names and emails, a picture, a checkbox, a company's state, a delete button in every row
    const cases: [string, string, (page: Page) => Promise<void>][] = [
        [
            search('/invoices/1/', 'E2E Lists rows'),
            'invoices',
            async (page) => {
                await expect(listRows(page, 'invoices')).toHaveCount(2);
                await expect(page.locator('section.invoices tbody svg.locked')).toHaveCount(1);
            },
        ],
        [
            search('/customers/1/', 'E2E Lists rows'),
            'customers',
            async (page) => {
                // The long name ends in "…" instead of taking a second line
                const name = listRows(page, 'customers').first().locator('td.name > a');

                // (the list adds the contact in brackets)
                await expect(name).toHaveText(`${rowsCustomer} (E2E)`);
                expect(await name.evaluate((a) => a.scrollWidth > a.clientWidth)).toBe(true);
            },
        ],
        [
            search('/users/1/', tag),
            'users',
            async (page) => {
                await expect(listRows(page, 'users')).toHaveCount(1);
                await expect(listRows(page, 'users').locator('img')).toHaveCount(1);
                // The long email ends in "…": the page stays as wide as the window and the
                // delete button inside it
                expect(
                    await page.evaluate(
                        () => document.documentElement.scrollWidth - window.innerWidth
                    )
                ).toBeLessThanOrEqual(0);
                const button = await listRows(page, 'users')
                    .getByRole('button', { name: 'Delete' })
                    .boundingBox();

                expect(button!.x + button!.width).toBeLessThanOrEqual(fifteenRows.width);
            },
        ],
        [
            `/worksheets/1/${customer}/1/`,
            'worksheets-per-customer',
            async (page) => {
                const rows = listRows(page, 'worksheets-per-customer');

                await expect(rows).toHaveCount(2);
                await expect(rows.locator('td.actions input[type=checkbox]')).toHaveCount(1);
            },
        ],
        ['/tenants/1/', 'tenants', none],
        ['/customers/1/', 'customers', none],
        ['/products/1/', 'products', none],
        ['/worksheets/1/', 'worksheets', none],
        ['/invoices/1/', 'invoices', none],
        ['/users/1/', 'users', none],
    ];

    for (const [path, resource, check] of cases) {
        await page.goto(path);
        await expect(listRows(page, resource).first()).toBeVisible();
        await check(page);

        expect(new Set(await rowHeights(page, resource)), path).toEqual(new Set([41]));
        // Nothing below the window ...
        expect(
            await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight),
            path
        ).toBeLessThanOrEqual(0);

        // ... and, when there are more pages, no room left for another row (12 px margin)
        if (await page.getByRole('link', { name: 'Go to next page' }).count()) {
            const left = await page
                .locator(`section.component.${resource}`)
                .evaluate((section) => window.innerHeight - section.getBoundingClientRect().bottom);

            expect(left, path).toBeLessThan(12 + 41);
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
    // Once the page has its texts: i18n saves the language it starts with, and a setItem made
    // while it was still starting was overwritten with "en" half of the time
    await expect(page.getByTestId('main-link-products')).toHaveText('Products');
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

// The one company this file uses, made on the first run and reused after: companies are never
// deleted (switched off at most), so a new one per run would pile up in the dev database. A run
// that stopped half way may have left it renamed or switched off; it is put back first.
const testCompany = 'E2E Company';

const testCompanyId = async (request: APIRequestContext, token: string): Promise<number> => {
    const found = await (
        await request.get(`${apiUrl}/tenants?keyword=${encodeURIComponent(testCompany)}&limit=50`, {
            headers: apiHeaders(token),
        })
    ).json();
    const existing = (found.resource as { id: number; name: string }[])
        .filter(({ name }) => name.startsWith(testCompany))
        .sort((a, b) => a.id - b.id)[0];

    if (existing) {
        await putCompany(request, token, existing.id, { name: testCompany, active: true });

        return existing.id;
    }

    const created = await (
        await request.post(`${apiUrl}/tenants`, {
            headers: apiHeaders(token),
            data: { name: testCompany, adminEmail: 'e2e-company@example.test', adminName: 'E2E' },
        })
    ).json();

    expect(created.success, 'the test company is made').toBe(true);

    return created.insertId;
};

const putCompany = async (
    request: APIRequestContext,
    token: string,
    id: number,
    change: { name?: string; active?: boolean }
) => {
    const body = await (
        await request.put(`${apiUrl}/tenants/${id}`, { headers: apiHeaders(token), data: change })
    ).json();

    expect(body.success, `company ${id} ${JSON.stringify(change)}`).toBe(true);
};

// Issue 42
test('the owner finds, opens, renames and switches a company off and on', async ({
    page,
    request,
}) => {
    const tag = Date.now().toString(36);
    const name = `${testCompany} ${tag}`;
    const token = await getApiToken(request);
    const id = await testCompanyId(request, token);

    // A name only this run has, so the search finds it alone
    await putCompany(request, token, id, { name });

    try {
        await page.goto('/tenants/1/');
        await expect(heading(page)).toHaveText('Companies');
        await page.getByTestId('search-button').click();
        await page.getByTestId('search-input').fill(tag);
        await expect(page).toHaveURL(`/tenants/1/?q=${tag}`);
        await expect(listRows(page, 'tenants')).toHaveCount(1);
        await expect(listRows(page, 'tenants').first()).toContainText('Active');

        await listRows(page, 'tenants').first().getByRole('link').first().click();
        await expect(page).toHaveURL(`/tenant/1/${id}/?q=${tag}`);
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

        // Back to the list, its search kept: the new name is there
        await page.getByRole('button', { name: 'Go Back' }).click();
        await expect(page).toHaveURL(`/tenants/1/?q=${tag}`);
        await expect(listRows(page, 'tenants')).toHaveCount(1);
        await expect(listRows(page, 'tenants').first()).toContainText(`${name} renamed`);
    } finally {
        await putCompany(request, token, id, { name: testCompany, active: true });
    }
});
