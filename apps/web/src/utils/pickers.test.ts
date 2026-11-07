import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounceLatest, pickerLabel, searchLoader, toPickerOption } from './pickers';

describe('pickerLabel', () => {
    it('is the name of a customer and the code and name of a product', () => {
        expect(pickerLabel('customers', { id: 1, name: 'Acme' })).toBe('Acme');
        expect(pickerLabel('products', { id: 3, code: 'P-3', name: 'Cable' })).toBe('P-3 - Cable');
    });

    it('never shows null', () => {
        expect(pickerLabel('customers', { id: 1, name: null })).toBe('');
        expect(pickerLabel('products', { id: 3, code: null, name: 'Cable' })).toBe(' - Cable');
    });
});

describe('toPickerOption', () => {
    it('keeps the item, so a choice gives the whole customer or product', () => {
        const cable = { id: 3, code: 'P-3', name: 'Cable', price: 19.99 };

        expect(toPickerOption('products', cable)).toEqual({
            label: 'P-3 - Cable',
            value: '3',
            item: cable,
        });
    });
});

describe('debounceLatest', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('asks once typing pauses, for the last word, and answers every caller with it', async () => {
        const load = vi.fn(async (word: string) => [word]);
        const search = debounceLatest(load, 250);

        const answers = Promise.all([search('a'), search('ac'), search('acme')]);

        await vi.advanceTimersByTimeAsync(249);
        expect(load).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(load).toHaveBeenCalledOnce();
        expect(load).toHaveBeenCalledWith('acme');
        expect(await answers).toEqual([['acme'], ['acme'], ['acme']]);
    });

    it('asks again for typing after a pause', async () => {
        const load = vi.fn(async (word: string) => [word]);
        const search = debounceLatest(load, 250);

        const first = search('a');
        await vi.advanceTimersByTimeAsync(250);
        const second = search('b');
        await vi.advanceTimersByTimeAsync(250);

        expect(await first).toEqual(['a']);
        expect(await second).toEqual(['b']);
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('passes a failure on to the callers', async () => {
        const search = debounceLatest(async () => Promise.reject(new Error('offline')), 250);
        const answer = search('a');
        const settled = expect(answer).rejects.toThrow('offline');

        await vi.advanceTimersByTimeAsync(250);
        await settled;
    });
});

// Copilot review of PR 24, round 3: the picker's first page (nothing typed) went through the same
// debounce as typing, so typing within 250 ms gave the first page the typed matches, and clearing
// the box showed those instead of the first page until the picker was opened again
describe('searchLoader', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('loads the first page at once and on its own, and debounces typing', async () => {
        const load = vi.fn(async (word: string) => [word || 'first page']);
        const search = searchLoader(load, 250);

        const firstPage = search('');
        const typed = [search('a'), search('ac')];

        expect(await firstPage).toEqual(['first page']);
        expect(load).toHaveBeenCalledWith('');

        await vi.advanceTimersByTimeAsync(250);

        expect(await Promise.all(typed)).toEqual([['ac'], ['ac']]);
        expect(load.mock.calls.map(([word]) => word)).toEqual(['', 'ac']);
    });

    it('treats a box of spaces as nothing typed', async () => {
        const load = vi.fn(async (word: string) => [word]);

        expect(await searchLoader(load, 250)('   ')).toEqual(['']);
    });
});
