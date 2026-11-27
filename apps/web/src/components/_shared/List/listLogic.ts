// The rules of a list, without React: which page, which request, which answer, which columns.
// ListPage, ListWidget, ListFrame, ListTable and the list hooks only wire these to the screen,
// so the rules are tested on their own (listLogic.test.ts).
import type { ReactNode } from 'react';
import { endpoint } from '../../../variables';

export const searchParam = 'q';

// A page of a list shows as many rows as fit on the screen: at least minRows, at most the 50 the
// API allows a page
export const minRows = 5;
export const maxRows = 50;

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
    // null while a list does not know its page size yet (useFitRows): it asks for nothing then
    limit: number | null;
    keyword?: string;
    // Extra query parameters, such as { customer: 4 } or { order: 'id', direction: 'DESC' }
    params?: ListParams;
}

// What the API says about the page (pageMeta in the API): the page the rows are from (the last
// one for a page past the end), the number of pages and of matching rows, and the page size.
// `total` is the number of pages under its old name.
export interface ListMetaIF {
    page?: number;
    pages?: number;
    rows?: number;
    limit?: number;
    total?: number;
}

export interface ListDataIF<T> {
    resource: T[];
    meta?: ListMetaIF;
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

/** An address of the list with its search word kept (all it keeps in the address but the page) */
export const withListParams = (href: string, keyword: string): string =>
    keyword ? `${href}?${searchParam}=${encodeURIComponent(keyword)}` : href;

/**
 * Where a new search word goes: page 1 of the list (the matches of page 3 of the full list mean
 * nothing), or nowhere when the word did not change.
 */
export const searchTarget = (
    next: string,
    keyword: string,
    firstPageHref: string
): string | null => (next === keyword ? null : withListParams(firstPageHref, next));

// The heights of a list on the screen, in pixels: the defaults are the list's own styles, for
// the parts not drawn yet (no rows while the first page loads)
export interface ListSpaceIF {
    // The window's inner height
    viewport: number;
    // Where the table starts, from the top of the page
    top: number;
    // The table's head row, one row, the footer ("1–15 of 212" and the pages), the margin below
    head?: number;
    row?: number;
    footer?: number;
    below?: number;
}

export const listHeights = { head: 40.5, row: 41, footer: 49, below: 12 };

/** The rows that fit between the table's top and the bottom of the window, from 5 to 50 */
export const fitRows = ({
    viewport,
    top,
    head = listHeights.head,
    row = listHeights.row,
    footer = listHeights.footer,
    below = listHeights.below,
}: ListSpaceIF): number => {
    const rows = Math.floor((viewport - top - head - footer - below) / (row > 0 ? row : 1));

    return Math.min(maxRows, Math.max(minRows, Number.isFinite(rows) ? rows : minRows));
};

/**
 * The page that still shows the first row of this page when the rows a page change (a resized
 * window): row 31 is on page 3 with 15 rows a page and on page 4 with 10.
 */
export const pageKeepingRow = (page: number, before: number, after: number): number =>
    Math.floor(((page - 1) * before) / after) + 1;

/** The number of pages, from an answer of this API version or an older one */
export const pagesOf = (meta: ListMetaIF | undefined): number => meta?.pages ?? meta?.total ?? 0;

/** The page numbers show only when there is more than one page */
export const showPages = (pages: number | undefined): boolean => (pages ?? 0) > 1;

/**
 * The page the address should show: the API answers a page past the end with the last page (or
 * page 1 when nothing matches), and the address follows it. Null when it already matches.
 */
export const pageCorrection = (requested: number, meta: ListMetaIF | undefined): number | null =>
    meta?.page && meta.page !== requested ? meta.page : null;

/** "16–30 of 212": the rows shown, counted over all pages; null without the counts */
export const rangeOf = (
    meta: ListMetaIF | undefined,
    shown: number
): { from: number; to: number; total: number } | null => {
    if (!meta?.rows || !meta.limit || !meta.page || shown < 1) {
        return null;
    }

    const from = (meta.page - 1) * meta.limit + 1;

    return { from, to: Math.min(from + shown - 1, meta.rows), total: meta.rows };
};

/** The page worth loading ahead while this one is read: the next one, when there is one */
export const nextPage = (page: number, pages: number): number | null =>
    page < pages ? page + 1 : null;

export const listQueryKey = ({ resource, page, limit, keyword = '', params }: ListRequestIF) => [
    resource,
    'list',
    { page, limit, keyword, ...params },
];

/** The request for one page: the list endpoint, with the search word when there is one */
export const listRequest = ({ path, page, limit, keyword, params = {} }: ListRequestIF) => ({
    url: `${endpoint}${path}`,
    params: {
        page,
        limit,
        ...params,
        // The API decodes the word once more (older callers sent it encoded)
        ...(keyword ? { keyword: encodeURIComponent(keyword) } : {}),
    },
});

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

/**
 * The column whose link Tab reaches in each row: the first one with a heading, so a row is named
 * by its number or name and not by a column without a heading (the invoice lock, a user's
 * picture). The first column when none has one.
 */
export const tabStopColumn = <T>(columns: ColumnIF<T>[]): number =>
    Math.max(
        columns.findIndex(({ label }) => !!label),
        0
    );

/** A cell without its own render: the row's field as text, nothing for a missing one */
export const cellText = <T>(row: T, key: string): string => {
    const value = (row as Record<string, unknown>)[key];

    return value === null || value === undefined ? '' : String(value);
};

export const tableClass = (className?: string, compact?: boolean): string =>
    ['general-table', className, compact ? 'compact' : ''].filter(Boolean).join(' ');

export const rowClass = (extra?: string): string => ['row', extra].filter(Boolean).join(' ');
