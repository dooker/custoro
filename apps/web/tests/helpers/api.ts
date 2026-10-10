import { expect, type APIRequestContext } from '@playwright/test';
import { getTestUser } from './login';

export const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:3999';

const origin = process.env.E2E_WEB_URL ?? 'http://localhost:3000';

export const apiHeaders = (token?: string) => ({
    Origin: origin,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

// Logs in and returns the API token; the E2E admin unless another user is given
export const getApiToken = async (
    request: APIRequestContext,
    user: { username: string; password: string } = getTestUser()
): Promise<string> => {
    const response = await request.post(`${apiUrl}/login`, {
        headers: apiHeaders(),
        data: user,
    });
    const body = await response.json();

    expect(body.success, `${user.username} can log in`).toBe(true);

    return body.token;
};
