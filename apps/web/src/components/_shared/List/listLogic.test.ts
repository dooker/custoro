import { describe, expect, it } from 'vitest';
import { endpoint, listPageSize } from '../../../variables';
import {
    cellText,
    listAnswer,
    listQueryKey,
    listRequest,
    pageAfterDelete,
    pageFromParam,
    resolveColumns,
    rowClass,
    nextPage,
    pageCorrection,
    pageSizeFromParam,
    pagesOf,
    rangeOf,
    searchTarget,
    showPages,
    sizeTarget,
    tableClass,
    withListParams,
    type ColumnIF,
} from './listLogic';

describe('pageFromParam', () => {
    it.each([
        ['3', 3],
        ['1', 1],
        [undefined, 1],
        ['', 1],
        ['0', 1],
        ['-2', 1],
        ['2.5', 1],
        ['abc', 1],
        ['3abc', 1],
    ])('reads %j as page %i', (raw, page) => {
        expect(pageFromParam(raw)).toBe(page);
    });
});

describe('pageAfterDelete', () => {
    it('stays on the page while it has other rows', () => {
        expect(pageAfterDelete(3, 4)).toBe(3);
    });

    it('goes to the page before after the last row of a page', () => {
        expect(pageAfterDelete(3, 1)).toBe(2);
    });

    it('stays on page 1 after its last row', () => {
        expect(pageAfterDelete(1, 1)).toBe(1);
    });

    it('treats an already empty page like a last row', () => {
        expect(pageAfterDelete(2, 0)).toBe(1);
    });
});

describe('pageSizeFromParam', () => {
    it.each([
        ['30', 30],
        ['50', 50],
        ['15', listPageSize],
        [null, listPageSize],
        ['', listPageSize],
        ['20', listPageSize],
        ['5000', listPageSize],
        ['abc', listPageSize],
    ])('reads %j as %i rows a page', (raw, size) => {
        expect(pageSizeFromParam(raw)).toBe(size);
    });
});

describe('withListParams', () => {
    it('keeps the search word, encoded', () => {
        expect(
            withListParams('/customers/2/', { keyword: 'Õnne & Co 50%', size: listPageSize })
        ).toBe('/customers/2/?q=%C3%95nne%20%26%20Co%2050%25');
    });

    it('keeps a page size other than the default', () => {
        expect(withListParams('/customers/2/', { keyword: '', size: 30 })).toBe(
            '/customers/2/?size=30'
        );
        expect(withListParams('/customers/2/', { keyword: 'orb', size: 50 })).toBe(
            '/customers/2/?q=orb&size=50'
        );
    });

    it('leaves an address without a search or another size alone', () => {
        expect(withListParams('/customers/2/', { keyword: '', size: listPageSize })).toBe(
            '/customers/2/'
        );
    });
});

describe('searchTarget', () => {
    const none = { keyword: '', size: listPageSize };

    it('sends a new word to page 1, wherever the search began', () => {
        expect(searchTarget('orb', none, '/customers/1/')).toBe('/customers/1/?q=orb');
    });

    it('keeps the page size', () => {
        expect(searchTarget('orb', { keyword: '', size: 30 }, '/customers/1/')).toBe(
            '/customers/1/?q=orb&size=30'
        );
    });

    it('goes to page 1 without a word when the search is cleared', () => {
        expect(searchTarget('', { ...none, keyword: 'orb' }, '/customers/1/')).toBe(
            '/customers/1/'
        );
    });

    it('does not move when the word did not change', () => {
        expect(searchTarget('orb', { ...none, keyword: 'orb' }, '/customers/1/')).toBeNull();
        expect(searchTarget('', none, '/customers/1/')).toBeNull();
    });
});

describe('sizeTarget', () => {
    it('sends a new size to page 1, the search kept', () => {
        expect(sizeTarget(50, { keyword: 'orb', size: listPageSize }, '/customers/1/')).toBe(
            '/customers/1/?q=orb&size=50'
        );
    });

    it('drops the size from the address when it is the default again', () => {
        expect(sizeTarget(listPageSize, { keyword: '', size: 30 }, '/customers/1/')).toBe(
            '/customers/1/'
        );
    });

    it('does not move when the size did not change', () => {
        expect(sizeTarget(30, { keyword: '', size: 30 }, '/customers/1/')).toBeNull();
    });
});

describe('pagesOf', () => {
    it('reads the number of pages, also from an older API that called it total', () => {
        expect(pagesOf({ pages: 4, total: 4 })).toBe(4);
        expect(pagesOf({ total: 3 })).toBe(3);
        expect(pagesOf({})).toBe(0);
        expect(pagesOf(undefined)).toBe(0);
    });
});

describe('pageCorrection', () => {
    it('follows the API to the last page for a page past the end', () => {
        expect(pageCorrection(999, { page: 35, pages: 35 })).toBe(35);
    });

    it('follows the API to page 1 when nothing matches', () => {
        expect(pageCorrection(4, { page: 1, pages: 0 })).toBe(1);
    });

    it('leaves a page the API answered as it is', () => {
        expect(pageCorrection(3, { page: 3, pages: 35 })).toBeNull();
        expect(pageCorrection(3, {})).toBeNull();
        expect(pageCorrection(3, undefined)).toBeNull();
    });
});

describe('rangeOf', () => {
    it('counts the rows shown over all pages', () => {
        expect(rangeOf({ page: 2, limit: 15, rows: 212 }, 15)).toEqual({
            from: 16,
            to: 30,
            total: 212,
        });
    });

    it('ends at the last row on the last page', () => {
        expect(rangeOf({ page: 15, limit: 15, rows: 212 }, 2)).toEqual({
            from: 211,
            to: 212,
            total: 212,
        });
    });

    it('has none without rows or without the counts (an older API)', () => {
        expect(rangeOf({ page: 1, limit: 15, rows: 0 }, 0)).toBeNull();
        expect(rangeOf({ page: 1, total: 3 }, 15)).toBeNull();
        expect(rangeOf(undefined, 15)).toBeNull();
    });
});

describe('nextPage', () => {
    it('loads the next page ahead while there is one', () => {
        expect(nextPage(1, 3)).toBe(2);
        expect(nextPage(3, 3)).toBeNull();
        expect(nextPage(1, 0)).toBeNull();
    });
});

describe('showPages', () => {
    it.each([
        [undefined, false],
        [0, false],
        [1, false],
        [2, true],
    ])('pages %j: page numbers shown %s', (pages, shown) => {
        expect(showPages(pages)).toBe(shown);
    });
});

describe('listRequest', () => {
    const base = { resource: 'customers', path: '/customers/', page: 2, limit: 15 };

    it('asks the list endpoint for the page', () => {
        expect(listRequest(base)).toEqual({
            url: `${endpoint}/customers/`,
            params: { page: 2, limit: 15 },
        });
    });

    it('adds the extra parameters', () => {
        expect(
            listRequest({ ...base, params: { customer: 4, order: 'id', direction: 'DESC' } })
        ).toEqual({
            url: `${endpoint}/customers/`,
            params: { page: 2, limit: 15, customer: 4, order: 'id', direction: 'DESC' },
        });
    });

    it('asks the same endpoint for a word, encoded', () => {
        expect(listRequest({ ...base, keyword: 'Õnne 50%' })).toEqual({
            url: `${endpoint}/customers/`,
            params: { page: 2, limit: 15, keyword: '%C3%95nne%2050%25' },
        });
    });

    it('searches one customer\u2019s worksheets with the customer kept', () => {
        expect(
            listRequest({
                ...base,
                resource: 'worksheets-per-customer',
                path: '/worksheets/',
                keyword: 'cable',
                params: { customer: 9 },
            })
        ).toEqual({
            url: `${endpoint}/worksheets/`,
            params: { page: 2, limit: 15, customer: 9, keyword: 'cable' },
        });
    });
});

describe('listQueryKey', () => {
    it('starts with the resource, so invalidating [resource] reads every page again', () => {
        expect(
            listQueryKey({ resource: 'products', path: '/products/', page: 1, limit: 5 })
        ).toEqual(['products', 'list', { page: 1, limit: 5, keyword: '' }]);
    });

    it('tells pages, words and parameters apart', () => {
        const base = { resource: 'invoices', path: '/invoices/', page: 1, limit: 15 };

        expect(listQueryKey({ ...base, page: 2 })).not.toEqual(listQueryKey(base));
        expect(listQueryKey({ ...base, keyword: 'a' })).not.toEqual(listQueryKey(base));
        expect(listQueryKey({ ...base, params: { customer: 1 } })).not.toEqual(
            listQueryKey({ ...base, params: { customer: 2 } })
        );
    });
});

describe('listAnswer', () => {
    it('gives the rows and the pages', () => {
        expect(
            listAnswer({ success: true, resource: [{ id: 1 }], meta: { pages: 3, page: 1 } })
        ).toEqual({ resource: [{ id: 1 }], meta: { pages: 3, page: 1 } });
    });

    it('takes a missing resource as no rows', () => {
        expect(listAnswer({ success: true })).toEqual({ resource: [], meta: undefined });
    });

    it('takes an answer without success (older endpoints) as rows', () => {
        expect(listAnswer({ resource: [{ id: 2 }] }).resource).toEqual([{ id: 2 }]);
    });

    it('makes a refusal an error with its message, not an empty list', () => {
        expect(() => listAnswer({ success: false, message: 'forbidden' })).toThrow('forbidden');
        expect(() => listAnswer({ success: false })).toThrow('error');
        expect(() => listAnswer(undefined)).toThrow('error');
    });
});

describe('resolveColumns', () => {
    const name: ColumnIF<{ locked: number }> = { key: 'name' };
    const lock: ColumnIF<{ locked: number }> = { key: 'locked' };

    it('takes a fixed list as it is', () => {
        expect(resolveColumns([name], [])).toEqual([name]);
    });

    it('lets a list choose its columns from the rows', () => {
        const columns = (rows: { locked: number }[]) =>
            rows.some((row) => row.locked) ? [lock, name] : [name];

        expect(resolveColumns(columns, [{ locked: 0 }])).toEqual([name]);
        expect(resolveColumns(columns, [{ locked: 0 }, { locked: 1 }])).toEqual([lock, name]);
    });
});

describe('cellText', () => {
    const row = { name: 'Orbit', count: 0, empty: null, flag: false };

    it('shows the field as text, 0 and false included', () => {
        expect(cellText(row, 'name')).toBe('Orbit');
        expect(cellText(row, 'count')).toBe('0');
        expect(cellText(row, 'flag')).toBe('false');
    });

    it('shows nothing for a missing or empty field', () => {
        expect(cellText(row, 'empty')).toBe('');
        expect(cellText(row, 'nope')).toBe('');
    });
});

describe('tableClass and rowClass', () => {
    it('builds the table class', () => {
        expect(tableClass()).toBe('general-table');
        expect(tableClass('products-table')).toBe('general-table products-table');
        expect(tableClass('products-table', true)).toBe('general-table products-table compact');
        expect(tableClass(undefined, true)).toBe('general-table compact');
    });

    it('builds the row class', () => {
        expect(rowClass()).toBe('row');
        expect(rowClass('')).toBe('row');
        expect(rowClass('disabled')).toBe('row disabled');
    });
});
