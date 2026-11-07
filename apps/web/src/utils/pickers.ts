// The customer and product pickers search the API as the user types and show one page of
// matches, instead of loading every customer or product up front (the API answers a list asked
// for without a page with one page now). Without React, so the rules can be unit tested.
import type { SelectOptionIF } from '../types';

export type PickerResource = 'customers' | 'products';

// As many matches as a picker shows; typing more narrows them down
export const pickerLimit = 20;

// How long typing has to pause before the API is asked
export const pickerDelayMs = 250;

interface PickerItemIF {
    id?: number | string;
    name?: string | null;
    code?: string | null;
}

export interface PickerOptionIF<T> extends SelectOptionIF {
    item: T;
}

/** The text a picker shows for an item: a customer's name, a product's code and name. */
export const pickerLabel = (resource: PickerResource, item: PickerItemIF): string =>
    resource === 'products' ? `${item.code ?? ''} - ${item.name ?? ''}` : (item.name ?? '');

export const toPickerOption = <T extends PickerItemIF>(
    resource: PickerResource,
    item: T
): PickerOptionIF<T> => ({
    label: pickerLabel(resource, item),
    value: String(item.id),
    item,
});

/**
 * Calls `load` once typing pauses for `delayMs`. Every call gets a promise; the ones that were
 * overtaken by newer typing get the answer of the newest call, so a picker never shows matches
 * for a word that is no longer in the box.
 */
export const debounceLatest = <A, R>(load: (arg: A) => Promise<R>, delayMs: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let waiting: { resolve: (value: R) => void; reject: (error: unknown) => void }[] = [];

    return (arg: A): Promise<R> =>
        new Promise<R>((resolve, reject) => {
            waiting.push({ resolve, reject });
            clearTimeout(timer);
            timer = setTimeout(() => {
                const callers = waiting;

                waiting = [];
                load(arg).then(
                    (value) => callers.forEach((caller) => caller.resolve(value)),
                    (error) => callers.forEach((caller) => caller.reject(error))
                );
            }, delayMs);
        });
};

/**
 * What a picker searches with: the first page (nothing typed) at once and on its own, typing
 * debounced. Sharing one debounce let typing within the delay answer the first-page request too,
 * so clearing the box showed the typed matches instead of the first page.
 */
export const searchLoader = <R>(load: (keyword: string) => Promise<R>, delayMs: number) => {
    const typed = debounceLatest(load, delayMs);

    return (keyword: string): Promise<R> =>
        keyword.trim() === '' ? load('') : typed(keyword.trim());
};
