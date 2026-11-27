import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/login';

// The layout is mobile first: on a phone the page is one column and never scrolls sideways, and
// the menu opens over the whole screen from the toggle in the header; from 900 px it is the
// sidebar. Reads the demo data only (CI starts with it), changes nothing.
const phone = { width: 375, height: 812 };
const desktop = { width: 1280, height: 835 };

const toggle = (page: Page) => page.getByTestId('menu-toggle');
const menu = (page: Page) => page.locator('#main-menu');

// Wider than the window: the page scrolls sideways (a table may scroll in its own box instead)
const pageWidth = (page: Page) =>
    page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        window: window.innerWidth,
    }));

const expectFits = async (page: Page, path: string) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // The lists ask for their rows once they know their size; wait for them
    await page.waitForLoadState('networkidle');

    const { page: width, window } = await pageWidth(page);

    expect(width, `${path} is ${width} px wide in a ${window} px window`).toBeLessThanOrEqual(
        window
    );
};

test.describe('on a phone', () => {
    test.use({ viewport: phone, hasTouch: true });

    test('every main page fits the screen', async ({ page, request }) => {
        await login({ page, request });

        for (const path of [
            '/home/',
            '/customers/1/',
            '/products/1/',
            '/worksheets/1/',
            '/invoices/1/',
            '/users/1/',
            '/settings/',
            '/profile/',
            '/changelog/',
        ]) {
            await expectFits(page, path);
        }

        // A record of each kind: the first row of its list
        for (const list of ['/customers/1/', '/products/1/', '/invoices/1/']) {
            await page.goto(list);
            await page.locator('tbody tr').first().getByRole('link').first().click();
            await expect(page).not.toHaveURL(list);
            await expectFits(page, new URL(page.url()).pathname);
        }
    });

    test('the menu opens over the whole screen and closes again', async ({ page, request }) => {
        await login({ page, request });
        await page.goto('/customers/1/');

        await expect(toggle(page)).toHaveAccessibleName('Open the menu');
        await expect(menu(page)).toBeHidden();

        await toggle(page).click();

        await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
        await expect(toggle(page)).toHaveAccessibleName('Close the menu');
        await expect(menu(page)).toBeVisible();
        // Once it has slid in (0.2 s)
        await expect.poll(() => menu(page).boundingBox()).toMatchObject({ x: 0, y: 0, ...phone });

        // The toggle stays on top: the same button closes it
        await toggle(page).click();
        await expect(menu(page)).toBeHidden();

        // A page opened from the menu closes it
        await toggle(page).click();
        await page.getByTestId('main-link-products').click();
        await expect(page).toHaveURL(/\/products\/1\/$/);
        await expect(menu(page)).toBeHidden();
        await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');

        // So does Escape
        await toggle(page).click();
        await expect(menu(page)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(menu(page)).toBeHidden();
    });
});

test.describe('on a wide screen', () => {
    test.use({ viewport: desktop });

    test('the menu is the sidebar, without the toggle', async ({ page, request }) => {
        await login({ page, request });
        await page.goto('/customers/1/');

        await expect(menu(page)).toBeVisible();
        await expect(toggle(page)).toBeHidden();
        expect((await menu(page).boundingBox())?.width).toBe(200);
    });
});
