import { test, expect, type APIRequestContext } from '@playwright/test';
import { apiHeaders, apiUrl, getApiToken } from './helpers/api';

// Uploads go through the E2E admin's profile picture, which is removed again after each test.
// The tests share that profile, so they run one after another. (The authorization tests change
// the regular user's profile at the same time, so this file stays away from it.)
const onePixelPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
);
const pngSignature = onePixelPng.subarray(0, 8);

interface ProfileIF {
    id: number;
    name: string;
    email: string;
    avatar: string;
}

const getProfile = async (request: APIRequestContext, token: string): Promise<ProfileIF> =>
    (await (await request.get(`${apiUrl}/profile`, { headers: apiHeaders(token) })).json())
        .resource;

const uploadAvatar = async (
    request: APIRequestContext,
    token: string,
    profile: ProfileIF,
    file: { name: string; mimeType: string; buffer: Buffer }
) =>
    (
        await request.put(`${apiUrl}/profile`, {
            headers: apiHeaders(token),
            multipart: { name: profile.name, email: profile.email, avatar: file },
        })
    ).json();

test.describe('image uploads', () => {
    test.describe.configure({ mode: 'serial' });

    let token: string;
    let profile: ProfileIF;

    test.beforeEach(async ({ request }) => {
        token = await getApiToken(request);
        profile = await getProfile(request, token);
    });

    test.afterEach(async ({ request }) => {
        const current = await getProfile(request, token);

        if (current.avatar && current.avatar !== profile.avatar) {
            await request.delete(`${apiUrl}/profile/${current.id}`, {
                headers: apiHeaders(token),
            });
        }
    });

    test('stores a real PNG under a name chosen by the server', async ({ request }) => {
        const body = await uploadAvatar(request, token, profile, {
            name: '../../evil.html',
            mimeType: 'image/png',
            buffer: onePixelPng,
        });

        expect(body.success).toBe(true);
        expect(body.filename).toMatch(/^\d+-[0-9a-f]{16}\.png$/);
        expect((await getProfile(request, token)).avatar).toBe(body.filename);
    });

    test('serves uploads with headers that stop the browser running them', async ({ request }) => {
        const { filename } = await uploadAvatar(request, token, profile, {
            name: 'avatar.png',
            mimeType: 'image/png',
            buffer: onePixelPng,
        });

        const response = await request.get(`${apiUrl}/uploads/${filename}`);

        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toBe('image/png');
        expect(response.headers()['x-content-type-options']).toBe('nosniff');
        expect(response.headers()['content-security-policy']).toContain('sandbox');
        expect(response.headers()['content-security-policy']).toContain("default-src 'none'");
    });

    test('removing the picture deletes the file', async ({ request }) => {
        const { filename } = await uploadAvatar(request, token, profile, {
            name: 'avatar.png',
            mimeType: 'image/png',
            buffer: onePixelPng,
        });

        await request.delete(`${apiUrl}/profile/${profile.id}`, { headers: apiHeaders(token) });

        expect((await getProfile(request, token)).avatar).toBeFalsy();
        expect((await request.get(`${apiUrl}/uploads/${filename}`)).status()).toBe(404);
    });

    const rejected: [string, { name: string; mimeType: string; buffer: Buffer }, string][] = [
        [
            'HTML declared as a PNG',
            {
                name: 'avatar.png',
                mimeType: 'image/png',
                buffer: Buffer.from('<html><script>alert(1)</script></html>'),
            },
            'uploadType',
        ],
        [
            'an SVG with a script',
            {
                name: 'avatar.svg',
                mimeType: 'image/svg+xml',
                buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'),
            },
            'uploadType',
        ],
        [
            'an HTML file',
            { name: 'page.html', mimeType: 'text/html', buffer: Buffer.from('<h1>hi</h1>') },
            'uploadType',
        ],
        [
            'an image over 5 MB',
            {
                name: 'big.png',
                mimeType: 'image/png',
                buffer: Buffer.concat([pngSignature, Buffer.alloc(5 * 1024 * 1024)]),
            },
            'uploadSize',
        ],
    ];

    for (const [name, file, message] of rejected) {
        test(`rejects ${name}`, async ({ request }) => {
            const body = await uploadAvatar(request, token, profile, file);

            expect(body).toEqual({ success: false, message });
            expect((await getProfile(request, token)).avatar).toBe(profile.avatar);
        });
    }

    test('does not list the uploads folder', async ({ request }) => {
        const response = await request.get(`${apiUrl}/uploads/`);

        expect(response.status()).toBe(404);
    });
});
