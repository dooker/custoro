// The rules of a list, without React: which page, which request, which answer, which columns.
// ListPage, ListWidget, ListFrame, ListTable and the list hooks only wire these to the screen,
// so the rules are tested on their own (listLogic.test.ts).
import type { ReactNode } from 'react';
import { endpoint } from '../../../variables';

export const searchParam = 'q';

export type ListParams = Record<string, string | number | undefined>;

export interface ColumnIF<T> {
    key: string;
    // A text key (or plain text such as "#") for the column head
    label?: string;
    className?: string;
    // The cell; without it the row's field of the same key
    render?: (row: T) => ReactNode;
}

export type Columns<T> = ColumnIF<T>[] | ((rows: T[]) => ColumnIF<T>[]);

export interface ListRequestIF {
    // The cache key's first part; invalidating [resource] reads every page of it again
    resource: string;
    // The list endpoint, such as /customers/
    path: string;
    page: number;
    limit: number;
    keyword?: string;
    // Extra query parameters, such as { customer: 4 } or { order: 'id', direction: 'DESC' }
    params?: ListParams;
    // Where a keyword goes: the shared /search endpoint (default) with this resource name, or the
    // list endpoint's own keyword parameter (GET /tenants)
    searchResource?: string;
    searchIn?: 'search' | 'list';
}

export interface ListDataIF<T> {
    resource: T[];
    meta?: { page?: number; total?: number };
}

export interface ListAnswerIF<T> {
    success?: boolean;
    message?: string;
    resource?: T[];
    meta?: ListDataIF<T>['meta'];
}

/** The page in the address (/customers/3/): a whole number from 1; anything else is page 1 */
export const pageFromParam = (raw: string | undefined): number => {
    const page = Number(raw);

    return Number.isInteger(page) && page > 0 ? page : 1;
};

/** The page to show after a delete: deleting the last row of a page goes to the page before */
export const pageAfterDelete = (page: number, rowsOnPage: number): number =>
    rowsOnPage <= 1 && page > 1 ? page - 1 : page;

/** An address of the list with its search word kept */
export const withSearch = (href: string, keyword: string): string =>
    keyword ? `${href}?${searchParam}=${encodeURIComponent(keyword)}` : href;

/**
 * Where a new search word goes: page 1 of the list (the matches of page 3 of the full list mean
 * nothing), or nowhere when the word did not change.
 */
export const searchTarget = (
    next: string,
    current: string,
    firstPageHref: string
): string | null => (next === current ? null : withSearch(firstPageHref, next));

/** The page numbers show only when there is more than one page */
export const showPages = (pages: number | undefined): boolean => (pages ?? 0) > 1;

export const listQueryKey = ({ resource, page, limit, keyword = '', params }: ListRequestIF) => [
    resource,
    'list',
    { page, limit, keyword, ...params },
];

/** The request for one page: the list endpoint, or /search when there is a word to look for */
export const listRequest = ({
    resource,
    path,
    page,
    limit,
    keyword,
    params = {},
    searchResource = resource,
    searchIn = 'search',
}: ListRequestIF) => {
    // The API decodes the keyword once more (older callers sent it encoded)
    const encoded = keyword ? encodeURIComponent(keyword) : undefined;

    if (encoded && searchIn === 'search') {
        return {
            url: `${endpoint}/search/`,
            params: { resource: searchResource, keyword: encoded, page, limit, ...params },
        };
    }

    return {
        url: `${endpoint}${path}`,
        params: { page, limit, ...params, ...(encoded ? { keyword: encoded } : {}) },
    };
};

/**
 * The rows of an answer. A refusal is an error, not an empty list, so the page can say the list
 * could not be loaded instead of "No entries".
 */
export const listAnswer = <T>(answer: ListAnswerIF<T> | undefined): ListDataIF<T> => {
    if (!answer || answer.success === false) {
        throw new Error(answer?.message || 'error');
    }

    return { resource: answer.resource ?? [], meta: answer.meta };
};

/** The columns for these rows: a list can add a column only some rows need (the invoice lock) */
export const resolveColumns = <T>(columns: Columns<T>, rows: T[]): ColumnIF<T>[] =>
    typeof columns === 'function' ? columns(rows) : columns;

/** A cell without its own render: the row's field as text, nothing for a missing one */
export const cellText = <T>(row: T, key: string): string => {
    const value = (row as Record<string, unknown>)[key];

    return value === null || value === undefined ? '' : String(value);
};

export const tableClass = (className?: string, compact?: boolean): string =>
    ['general-table', className, compact ? 'compact' : ''].filter(Boolean).join(' ');

export const rowClass = (extra?: string): string => ['row', extra].filter(Boolean).join(' ');
