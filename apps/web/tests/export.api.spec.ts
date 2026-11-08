import { test, expect } from '@playwright/test';
import { apiHeaders, apiUrl, getApiToken } from './helpers/api';

// GET /export/invoices: the invoices of a period as CSV for the accountant, with the totals of
// the PDFs. Uses the demo invoices of apps/api/db/demo/demo-data.sql (admin login E2E_USER); the
// roles are tested in authorization.api.spec.ts.
const exportCsv = async (
    request: Parameters<typeof getApiToken>[0],
    query: string,
    token?: string
) => {
    const response = await request.get(`${apiUrl}/export/invoices?${query}`, {
        headers: apiHeaders(token ?? (await getApiToken(request))),
    });

    return response;
};

const rows = (csv: string) =>
    csv
        .replace(/^\uFEFF/, '')
        .trimEnd()
        .split('\r\n')
        .map((line) => line.split(';'));

test.describe('invoice export', () => {
    test('is a CSV file with a line per invoice and the totals of the PDF', async ({ request }) => {
        const response = await exportCsv(request, 'from=2025-09-01&to=2025-09-30&language=en');

        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toBe('text/csv; charset=utf-8');
        expect(response.headers()['content-disposition']).toBe(
            'attachment; filename="invoices_2025-09-01_2025-09-30.csv"'
        );

        const csv = await response.text();
        const [header, ...lines] = rows(csv);

        expect(csv.startsWith('\uFEFF')).toBe(true);
        expect(header).toEqual([
            'Number',
            'Date',
            'Due date',
            'Customer',
            'Reg. number',
            'VAT number',
            'Net',
            'VAT %',
            'VAT',
            'Total',
            'Paid',
            'Emailed',
        ]);

        // Invoice 1: 1899.96 net at 24 % (the VAT number is a placeholder, so VAT applies)
        const first = lines.find(([number]) => number === 'INV-SPACE-001');

        expect(first?.slice(0, 10)).toEqual([
            'INV-SPACE-001',
            '2025-09-11',
            '2025-09-25',
            'Sir Reginald Pompous',
            'RGN-001',
            'VAT-001',
            '1899,96',
            '24',
            '455,99',
            '2355,95',
        ]);
        expect(lines.every(([, date]) => date >= '2025-09-01' && date <= '2025-09-30')).toBe(true);
    });

    test('has no VAT for a foreign VAT number, and Estonian headings', async ({ request }) => {
        const response = await exportCsv(request, 'from=2026-09-26&to=2026-09-26&language=et');
        const [header, ...lines] = rows(await response.text());
        // Invoice 5: Asteroid Accounting SIA, Latvian VAT number
        const latvian = lines.find(([, , , customer]) => customer === 'Asteroid Accounting SIA');

        expect(header.slice(0, 4)).toEqual(['Number', 'Kuupäev', 'Maksetähtaeg', 'Klient']);
        expect(latvian?.[5]).toBe('LV00000000015');
        expect(latvian?.slice(7, 9)).toEqual(['0', '0,00']);
        expect(latvian?.[9]).toBe(latvian?.[6]);
    });

    test('refuses a period it cannot read, or longer than a year', async ({ request }) => {
        const token = await getApiToken(request);

        for (const query of [
            'from=2026-10-31&to=2026-10-01',
            'from=2026-02-30&to=2026-03-01',
            "from=2026-10-01'%20OR%201=1--&to=2026-10-31",
            'to=2026-10-31',
        ]) {
            const response = await exportCsv(request, query, token);

            expect(await response.json(), query).toEqual({
                success: false,
                message: 'invalidInput',
            });
        }

        expect(
            await (await exportCsv(request, 'from=2025-01-01&to=2026-06-30', token)).json()
        ).toEqual({ success: false, message: 'export.rangeTooLong' });
    });
});
