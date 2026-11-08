import { describe, expect, it } from 'vitest';
import { previousMonth } from './exportPeriod';

describe('previousMonth', () => {
    it('is the whole calendar month before today', () => {
        expect(previousMonth(new Date(2026, 10, 8))).toEqual({
            from: '2026-10-01',
            to: '2026-10-31',
        });
    });

    it('goes back over the new year and knows February', () => {
        expect(previousMonth(new Date(2027, 0, 15))).toEqual({
            from: '2026-12-01',
            to: '2026-12-31',
        });
        expect(previousMonth(new Date(2028, 2, 1))).toEqual({
            from: '2028-02-01',
            to: '2028-02-29',
        });
    });
});
