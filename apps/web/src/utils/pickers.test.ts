import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounceLatest, pickerLabel, toPickerOption } from './pickers';

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
