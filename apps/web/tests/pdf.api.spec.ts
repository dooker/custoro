import { test, expect, type APIRequestContext } from '@playwright/test';
import { apiHeaders, apiUrl, getApiToken } from './helpers/api';

// Uses demo invoice 5 from apps/api/db/demo/demo-data.sql. Generating its PDF writes the file
// into the API's PDF storage, as the app itself does.
const invoiceId = 5;

const getInvoice = async (request: APIRequestContext, token: string) =>
    (
        await (
            await request.get(`${apiUrl}/invoice/${invoiceId}`, { headers: apiHeaders(token) })
        ).json()
    ).data[0];

const generatePdf = async (request: APIRequestContext, token: string) =>
    (
        await request.put(`${apiUrl}/pdf/${invoiceId}`, {
            headers: apiHeaders(token),
            data: { language: 'en' },
        })
    ).json();

test.describe('invoice PDFs', () => {
    // The tests regenerate the same invoice, so they run one after another
    test.describe.configure({ mode: 'serial' });

    let token: string;

    test.beforeEach(async ({ request }) => {
        token = await getApiToken(request);
    });

    test('regenerating a PDF keeps its public link', async ({ request }) => {
        const hashBefore = (await getInvoice(request, token)).hash;

        const first = await generatePdf(request, token);
        const second = await generatePdf(request, token);

        expect(first.success).toBe(true);
        expect(first.hash).toMatch(/^[0-9a-f]{32}$/);
        expect(second.hash).toBe(first.hash);

        if (hashBefore) {
            expect(first.hash).toBe(hashBefore);
        }
    });

    test('anyone with the link can open the PDF, without logging in', async ({ request }) => {
        const { hash } = await generatePdf(request, token);

        const response = await request.get(`${apiUrl}/pdf/${hash}`);

        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toContain('application/pdf');
        expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
    });

    test('an unknown link finds nothing', async ({ request }) => {
        const response = await request.get(`${apiUrl}/pdf/${'0'.repeat(32)}`);

        expect(response.status()).toBe(404);
    });

    test('the invoice number or file name is not enough to open a PDF', async ({ request }) => {
        await generatePdf(request, token);
        const { number, filename } = await getInvoice(request, token);

        for (const guess of [number, filename, filename.replace(/\.pdf$/, '')]) {
            const response = await request.get(`${apiUrl}/pdf/${encodeURIComponent(guess)}`);

            expect(response.status(), `GET /pdf/${guess}`).toBe(404);
        }
    });

    test('path tricks in the link find nothing', async ({ request }) => {
        for (const trick of [
            '..%2F..%2Fpackage.json',
            '%2e%2e%2f%2e%2e%2fpackage.json',
            '..%2Fstorage%2Fpdf%2Finvoice_25002.pdf',
        ]) {
            const response = await request.get(`${apiUrl}/pdf/${trick}`);

            expect(response.status(), `GET /pdf/${trick}`).toBe(404);
            expect(response.headers()['content-type'] ?? '').not.toContain('application/pdf');
        }
    });

    test('PDFs are not reachable through the public uploads folder', async ({ request }) => {
        await generatePdf(request, token);
        const { filename } = await getInvoice(request, token);

        for (const path of [`/uploads/${filename}`, `/uploads/pdf/${filename}`]) {
            expect((await request.get(`${apiUrl}${path}`)).status(), path).toBe(404);
        }
    });
});

// The prefix is part of the PDF's path on disk and of its download name, so it has to stay
// plain: a "../" would write and read PDFs outside the PDF folder, and a character a header
// cannot carry used to crash the server on the public PDF link
test.describe('invoice file name prefix', () => {
    const readPrefix = async (request: APIRequestContext, token: string) =>
        (await (await request.get(`${apiUrl}/settings`, { headers: apiHeaders(token) })).json())
            .data[0].invoiceFilenamePrefix as string;

    const putPrefix = (request: APIRequestContext, token: string, value: string) =>
        request.put(`${apiUrl}/settings`, {
            headers: apiHeaders(token),
            data: { invoiceFilenamePrefix: value },
        });

    for (const prefix of [
        '../',
        '../../uploads/x_',
        'sub/invoice_',
        'arve_š',
        'arve_€',
        'invoice_\r\nX-Evil: 1',
        'invoice.',
        'a'.repeat(33),
    ]) {
        test(`${JSON.stringify(prefix)} is refused`, async ({ request }) => {
            const token = await getApiToken(request);
            const before = await readPrefix(request, token);

            expect(await (await putPrefix(request, token, prefix)).json()).toEqual({
                success: false,
                message: 'filenamePrefix',
            });
            expect(await readPrefix(request, token)).toBe(before);
        });
    }

    test('the current prefix is accepted', async ({ request }) => {
        const token = await getApiToken(request);
        const before = await readPrefix(request, token);

        expect((await (await putPrefix(request, token, before)).json()).success).toBe(true);
        expect(await readPrefix(request, token)).toBe(before);
    });
});
