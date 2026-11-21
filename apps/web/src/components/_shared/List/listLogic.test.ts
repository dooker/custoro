import { describe, expect, it } from 'vitest';
import { endpoint } from '../../../variables';
import {
    cellText,
    listAnswer,
    listQueryKey,
    listRequest,
    pageAfterDelete,
    pageFromParam,
    resolveColumns,
    rowClass,
    searchTarget,
    showPages,
    tableClass,
    withSearch,
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

describe('withSearch', () => {
    it('keeps the search word, encoded', () => {
        expect(withSearch('/customers/2/', 'Õnne & Co 50%')).toBe(
            '/customers/2/?q=%C3%95nne%20%26%20Co%2050%25'
        );
    });

    it('leaves an address without a search alone', () => {
        expect(withSearch('/customers/2/', '')).toBe('/customers/2/');
    });
});

describe('searchTarget', () => {
    it('sends a new word to page 1, wherever the search began', () => {
        expect(searchTarget('orb', '', '/customers/1/')).toBe('/customers/1/?q=orb');
    });

    it('goes to page 1 without a word when the search is cleared', () => {
        expect(searchTarget('', 'orb', '/customers/1/')).toBe('/customers/1/');
    });

    it('does not move when the word did not change', () => {
        expect(searchTarget('orb', 'orb', '/customers/1/')).toBeNull();
        expect(searchTarget('', '', '/customers/1/')).toBeNull();
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
            listAnswer({ success: true, resource: [{ id: 1 }], meta: { total: 3, page: 1 } })
        ).toEqual({ resource: [{ id: 1 }], meta: { total: 3, page: 1 } });
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
