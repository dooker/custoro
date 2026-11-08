import { expect, type APIRequestContext } from '@playwright/test';
import { apiHeaders, apiUrl } from './api';

// The mail catcher of docker-compose.yml (scripts/mail-catcher.mjs): every email the dev API sends
export const mailUrl = process.env.E2E_MAIL_URL ?? 'http://localhost:8025';

interface MailIF {
    to: string[];
    subject: string;
    text: string;
    html: string;
}

export const mailsTo = async (request: APIRequestContext, to: string): Promise<MailIF[]> =>
    (await request.get(`${mailUrl}/messages?to=${encodeURIComponent(to)}`)).json();

const linkToken = (mail: MailIF | undefined) =>
    /\/restore\/([0-9a-f]{64})/.exec(mail?.text ?? '')?.[1] ?? null;

/** Runs `action`, waits for the next email to `to` and returns the token of its password link */
export const nextPasswordLink = async <T>(
    request: APIRequestContext,
    to: string,
    action: () => Promise<T>
) => {
    const before = (await mailsTo(request, to)).length;
    const result = await action();

    await expect
        .poll(async () => (await mailsTo(request, to)).length, { message: `an email to ${to}` })
        .toBeGreaterThan(before);

    const token = linkToken((await mailsTo(request, to)).at(-1));

    expect(token, `a password link in the email to ${to}`).not.toBeNull();

    return { result, token: token as string };
};

/** Runs `action` and checks that no email to `to` arrives within two seconds */
export const noMailTo = async (
    request: APIRequestContext,
    to: string,
    action: () => Promise<unknown>
) => {
    const before = (await mailsTo(request, to)).length;

    await action();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect((await mailsTo(request, to)).length, `no email to ${to}`).toBe(before);
};

/**
 * Makes sure the password email of the settings has [RESTORE_LINK]: the demo data has it, a dev
 * database from before the demo data had it does not
 */
export const ensurePasswordEmail = async (request: APIRequestContext, adminToken: string) => {
    const settings = await (
        await request.get(`${apiUrl}/settings`, { headers: apiHeaders(adminToken) })
    ).json();

    if (String(settings.data?.[0]?.forgotText ?? '').includes('[RESTORE_LINK]')) {
        return;
    }

    const saved = await request.put(`${apiUrl}/settings`, {
        headers: apiHeaders(adminToken),
        data: {
            forgotSubject: 'Your password',
            forgotText: 'Set your password here: [RESTORE_LINK]',
            forgotHtml: '<p><a href="[RESTORE_LINK]">[RESTORE_LINK]</a></p>',
        },
    });

    expect((await saved.json()).success).toBe(true);
};
