import { describe, expect, it } from 'vitest';
import { scrubPdfHash, scrubResetToken, scrubSentryPayload } from './sentryScrub';

const token = 'a'.repeat(64);
// The public link of an invoice PDF: /pdf/<hash> opens the PDF without a login
const hash = '902826ad2a84a293a1fe8b480cb0b8db';

describe('scrubResetToken', () => {
    it.each([
        ['a path', `/restore/${token}`, '/restore/[token]'],
        [
            'a full URL',
            `https://app.example/restore/${token}?x=1#y`,
            'https://app.example/restore/[token]?x=1#y',
        ],
        [
            'a URL inside text',
            `Navigated to /restore/${token} from /login`,
            'Navigated to /restore/[token] from /login',
        ],
    ])('removes the token from %s', (_case, input, expected) => {
        expect(scrubResetToken(input)).toBe(expected);
    });

    it('leaves other URLs alone', () => {
        expect(scrubResetToken('/invoice/5')).toBe('/invoice/5');
    });
});

describe('scrubPdfHash', () => {
    it.each([
        ['the page of the PDF', `/pdf/${hash}/`, '/pdf/[hash]/'],
        [
            'a full URL',
            `https://app.example/pdf/${hash}/?x=1#y`,
            'https://app.example/pdf/[hash]/?x=1#y',
        ],
        [
            'the API request for it',
            `GET https://app.example/api/pdf/${hash}/`,
            'GET https://app.example/api/pdf/[hash]/',
        ],
        ['capitals', `/pdf/${hash.toUpperCase()}`, '/pdf/[hash]'],
    ])('removes the hash from %s', (_case, input, expected) => {
        expect(scrubPdfHash(input)).toBe(expected);
    });

    it('keeps the invoice id of the request that makes a PDF', () => {
        expect(scrubPdfHash('PUT /api/pdf/6/')).toBe('PUT /api/pdf/6/');
    });
});

describe('scrubSentryPayload', () => {
    it('removes the PDF hash from an event, its breadcrumbs and a replay', () => {
        const event = {
            transaction: `/pdf/${hash}/`,
            request: { url: `https://app.example/pdf/${hash}/` },
            breadcrumbs: [
                { category: 'navigation', data: { to: `/pdf/${hash}/` } },
                { category: 'xhr', data: { url: `/api/pdf/${hash}/`, method: 'GET' } },
            ],
            replay: { data: { href: `https://app.example/pdf/${hash}/` } },
        };

        expect(JSON.stringify(scrubSentryPayload(event))).not.toContain(hash);
        expect(scrubSentryPayload(event).breadcrumbs[1].data.url).toBe('/api/pdf/[hash]/');
    });

    it('removes the token from every field of an event', () => {
        const event = {
            transaction: `/restore/${token}`,
            request: { url: `https://app.example/restore/${token}` },
            breadcrumbs: [{ data: { from: '/forgot', to: `/restore/${token}` } }],
        };

        expect(JSON.stringify(scrubSentryPayload(event))).not.toContain(token);
    });

    it('returns the same object when there is nothing to remove', () => {
        const event = { transaction: '/invoices' };

        expect(scrubSentryPayload(event)).toBe(event);
    });
});
