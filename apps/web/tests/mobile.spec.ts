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

    test('the login screen fits, its button the whole width with the link under it', async ({
        page,
    }) => {
        await page.goto('/login/');

        const box = await page.locator('.modal-content').boundingBox();
        const button = await page.getByTestId('login-submit-button').boundingBox();
        const link = await page.getByRole('link', { name: 'Forgot password?' }).boundingBox();

        // Inside the screen, centred: it was pushed past the right edge
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(phone.width);
        expect(Math.abs(box!.x - (phone.width - box!.x - box!.width))).toBeLessThanOrEqual(1);
        // The button spans the box but its gutters; the link no longer lies over it
        expect(button!.width).toBeGreaterThan(box!.width - 30);
        expect(link!.y).toBeGreaterThanOrEqual(button!.y + button!.height);
        // The faint name stays in the top band on a phone
        expect(
            await page.evaluate(
                () => getComputedStyle(document.getElementById('root')!, '::after').display
            )
        ).not.toBe('none');
    });

    test('buttons are the whole width, one on top of the other', async ({ page, request }) => {
        await login({ page, request });
        await page.goto('/customers/1/');
        await page.locator('tbody tr').first().getByRole('link').first().click();
        await expect(page).toHaveURL(/\/customer\/1\/\d+\/$/);
        await expect(
            page.locator('header').first().getByRole('button', { name: 'Delete' })
        ).toBeVisible();

        // Save is the first, but it stays at the bottom of the screen (its own test below)
        const buttons = await page
            .locator('header')
            .first()
            .getByRole('button')
            .evaluateAll((all) =>
                all
                    .filter((button) => button.textContent?.trim() !== 'Save')
                    .map((button) => button.getBoundingClientRect().toJSON())
            );

        expect(buttons.length).toBeGreaterThan(1);

        for (const [index, button] of buttons.entries()) {
            expect(button.width).toBeGreaterThan(phone.width - 30);

            if (index > 0) {
                expect(button.top).toBeGreaterThanOrEqual(buttons[index - 1].bottom);
            }
        }
    });

    test('Home’s small lists are as high as their rows, not the screen', async ({
        page,
        request,
    }) => {
        await login({ page, request });
        await page.goto('/home/');
        await expect(page.locator('section.component.customers tbody tr').first()).toBeVisible();

        const heights = await page
            .locator('section.component')
            .evaluateAll((all) => all.map((section) => section.getBoundingClientRect().height));

        expect(heights).toHaveLength(4);

        for (const height of heights) {
            // Five rows and their heading: about 300 px; each was a whole screen high
            expect(height).toBeLessThan(phone.height / 2);
        }

        // Its title where a list's is, above its buttons (it sat 3.5 px lower alone in the band)
        const titleTop = async () =>
            (await page.getByRole('heading', { level: 1 }).boundingBox())!.y;
        const home = await titleTop();

        await page.goto('/products/1/');
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Products');
        expect(await titleTop()).toBe(home);
    });

    test('Home’s small lists show their icon and their title opens the list', async ({
        page,
        request,
    }) => {
        await login({ page, request });
        await page.goto('/home/');

        const title = page.getByRole('link', { name: 'Latest Products' });

        await expect(title.locator('svg')).toBeVisible();
        await title.click();
        await expect(page).toHaveURL(/\/products\/1\/$/);
    });

    test('the search field opens as its own row, as high as on a desktop', async ({
        page,
        request,
    }) => {
        await login({ page, request });
        await page.goto('/customers/1/');
        await page.getByTestId('search-button').click();

        const button = (await page.getByTestId('search-button').boundingBox())!;
        const field = (await page.getByTestId('search-input').boundingBox())!;

        // Under the full-width button, the whole width, 50 px high
        expect(field.y).toBeGreaterThanOrEqual(button.y + button.height);
        expect(field.width).toBe(button.width);
        expect(field.height).toBe(50);
    });

    test('Settings: the sections open as a menu over the form, fields one per row', async ({
        page,
        request,
    }) => {
        await login({ page, request });
        await page.goto('/settings/');

        const sections = page.getByTestId('settings-sections');
        const firstField = page.locator('.general-form .field').first();
        const fieldTop = (await firstField.boundingBox())!.y;

        await expect(sections).toHaveText('General settings');
        await sections.click();
        await expect(page.locator('#settings-sections button')).toHaveCount(6);
        // Over the form: nothing under it moved
        expect((await firstField.boundingBox())!.y).toBe(fieldTop);

        await page.getByRole('button', { name: 'Pdf settings' }).click();
        await expect(page).toHaveURL(/\/settings\/pdf\/$/);
        await expect(page.locator('#settings-sections')).toHaveCount(0);
        await expect(sections).toHaveText('Pdf settings');

        // Logo and Disclaimer one under the other
        const lefts = await page
            .locator('.general-form .field')
            .evaluateAll((all) => all.map((field) => field.getBoundingClientRect().left));

        expect(new Set(lefts).size).toBe(1);
    });

    test('a form’s Save stays at the bottom of the screen while it scrolls', async ({
        page,
        request,
    }) => {
        await login({ page, request });
        await page.goto('/customers/1/');
        await page.locator('tbody tr').first().getByRole('link').first().click();
        await expect(page).toHaveURL(/\/customer\/1\/\d+\/$/);

        const save = page.locator('header').first().getByRole('button', { name: 'Save' });
        const bottomGap = async () => {
            const box = (await save.boundingBox())!;

            return phone.height - (box.y + box.height);
        };

        expect(await bottomGap()).toBe(12);
        await page.mouse.wheel(0, 2000);
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
        expect(await bottomGap()).toBe(12);
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
