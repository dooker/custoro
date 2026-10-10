import { test, expect, type Page } from '@playwright/test';
import { getTestUser, login } from './helpers/login';

const fillLoginForm = async (page: Page, username: string, password: string) => {
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(password);
    await page.getByTestId('login-submit-button').click();
};

test.describe('with a stored token', () => {
    test.beforeEach(async ({ page, request }) => {
        await login({ page, request });
    });

    test('opens the home page', async ({ page }) => {
        await expect(page).toHaveURL(/\/home/);
    });
});

test.describe('login form', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login/');
        await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    });

    test('logs in with valid credentials', async ({ page }) => {
        const { username, password } = getTestUser();

        await fillLoginForm(page, username, password);

        await expect(page).toHaveURL(/\/home/);
    });

    test('shows the API error for a wrong password', async ({ page }) => {
        await fillLoginForm(page, getTestUser().username, 'not-the-password');

        await expect(page.getByText('None shall pass!')).toBeVisible();
        await expect(page).toHaveURL(/\/login/);
    });

    test('requires a username and a password', async ({ page }) => {
        await page.getByTestId('login-submit-button').click();

        await expect(page.getByText('Username is required')).toBeVisible();
        await expect(page.getByText('Password is required')).toBeVisible();
    });

    test('rejects a username that is not an email', async ({ page }) => {
        await fillLoginForm(page, 'captain', 'any-password');

        await expect(page.getByText('Email format is incorrect')).toBeVisible();
    });
});

test('forgot password sends the reset request', async ({ page }) => {
    await page.goto('/login/');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page.getByRole('heading', { name: 'Restore password' })).toBeVisible();

    // An unknown address gets the same answer as a known one, and no email is sent
    await page.getByLabel('Username').fill('nobody@example.test');
    await page.getByRole('button', { name: 'Send email' }).click();

    await expect(page.getByText('We sent an email to your email address')).toBeVisible();
});

test.describe('reset password link', () => {
    for (const [name, token] of [
        ['an unknown token', 'f'.repeat(64)],
        ['a malformed token', 'not-a-token'],
    ]) {
        test(`rejects ${name}`, async ({ page }) => {
            await page.goto(`/restore/${token}/`);
            await expect(page.getByRole('heading', { name: 'Create new password' })).toBeVisible();

            await expect(page.getByText('Token is not recognized')).toBeVisible();
            await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
        });
    }
});
