import type { LoginIF } from '../../src/types/playwright';

const requireEnv = (name: string): string => {
    const value = process.env[name];

    if (!value) {
        throw new Error(
            `${name} is not set. Copy apps/web/.env.development.example to apps/web/.env, ` +
                'or set it in the environment.'
        );
    }

    return value;
};

// The account the end-to-end tests log in with, from E2E_USER and E2E_PASS (an admin)
export const getTestUser = () => ({
    username: requireEnv('E2E_USER'),
    password: requireEnv('E2E_PASS'),
});

// A user with the "user" role, from E2E_REGULAR_USER and E2E_REGULAR_PASS
export const getRegularUser = () => ({
    username: requireEnv('E2E_REGULAR_USER'),
    password: requireEnv('E2E_REGULAR_PASS'),
});

// Logs in through the API and stores the token, skipping the login form
export const login = async ({ page, request }: LoginIF) => {
    const response = await request.post(
        `${process.env.E2E_API_URL ?? 'http://localhost:3999'}/login`,
        {
            headers: {
                Origin: process.env.E2E_WEB_URL ?? 'http://localhost:3000',
            },
            data: getTestUser(),
        }
    );

    const { token } = await response.json();

    await page.addInitScript((token: string) => {
        window.localStorage.setItem('loginToken', token);
    }, token);

    await page.goto('/home');
};
