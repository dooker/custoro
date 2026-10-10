import { describe, expect, it } from 'vitest';
import { scrubResetToken, scrubSentryPayload } from './sentryScrub';

const token = 'a'.repeat(64);

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

describe('scrubSentryPayload', () => {
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
