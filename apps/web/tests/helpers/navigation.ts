import { expect } from '@playwright/test';
import type { GoAndCheckIF } from '../../src/types/playwright';

export const goAndCheck = async ({page, key}: GoAndCheckIF) => {
    await page.getByTestId(`main-link-${key}`).click();

    const pattern = new RegExp(`/${key}`);
    await expect(page).toHaveURL(pattern);
}
