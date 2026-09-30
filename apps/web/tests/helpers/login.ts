import type { LoginIF } from '../../src/types/playwright';

export const login = async ({page, request}: LoginIF) => {
    const response = await request.post(`${process.env.E2E_API_URL ?? 'http://localhost:3999'}/login`, {
  headers: {
    Origin: process.env.E2E_WEB_URL ?? 'http://localhost:3000'
  },
          data: {
            username: process.env.E2E_USER,
            password: process.env.E2E_PASS
        }
    });

    const { token } = await response.json();

    await page.addInitScript((token: string) => {
        window.localStorage.setItem('loginToken', token);
    }, token);

    await page.goto('/home');
}
