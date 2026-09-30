import { test, expect } from '@playwright/test';
import { login } from './helpers/login';

test.beforeEach(async ({ page, request }) => {
    await login({page, request});
});

test('user can login with valid credentials', async ({ page }) => {
    await expect(page).toHaveURL(/\/home/);
});