import { describe, expect, it } from "vitest";
import { config } from "../config/config";
import {
    applyPaging,
    getCustomers,
    getFromTo,
    getInvoices,
    getPaging,
    getProducts,
    getUsers,
    getWorksheets,
    keywordWhere,
    pageMeta,
    keywordWords,
    limitMarker,
    type SearchTable
} from "./_getters";

const { itemsPerPage, maxItemsPerPage, maxKeywordWords, maxKeywordLength } = config;

describe("getPaging", () => {
    it("takes a page and a size as they are", () => {
        expect(getPaging("3", "25")).toEqual({ page: 3, limit: 25 });
        expect(getPaging(2, 10)).toEqual({ page: 2, limit: 10 });
    });

    it("never gives more than the largest page size", () => {
        expect(getPaging("1", "50")).toEqual({ page: 1, limit: maxItemsPerPage });
        expect(getPaging("1", "51")).toEqual({ page: 1, limit: maxItemsPerPage });
        expect(getPaging("1", "1000000")).toEqual({ page: 1, limit: maxItemsPerPage });
        expect(getPaging("1", "999999999")).toEqual({ page: 1, limit: maxItemsPerPage });
    });

    it("treats a page or size that is not a positive whole number as missing", () => {
        for (const value of ["0", "-1", "1.5", "abc", "1e3", "0x10", " ", "NaN", "Infinity"]) {
            expect(getPaging(value, "10"), `page ${value}`).toEqual({ page: 1, limit: 10 });
            expect(getPaging("2", value), `limit ${value}`).toEqual({
                page: 2,
                limit: itemsPerPage
            });
        }

        // More digits than any real table has pages
        expect(getPaging("12345678901234567890", "10").page).toBe(1);
    });

    it("does not accept lists or objects, which a query string can produce", () => {
        expect(getPaging(["2", "3"], "10")).toEqual({ page: 1, limit: 10 });
        expect(getPaging("2", { a: "10" })).toEqual({ page: 2, limit: itemsPerPage });
    });

    it("keeps page 0 from meaning the whole table", () => {
        expect(getPaging("0", "10")).toEqual({ page: 1, limit: 10 });
        expect(getPaging(0, 0)).toEqual({ page: 1, limit: itemsPerPage });
    });

    // It used to be up to 1000 rows, for the web app's pickers, which search now
    it("gives the first page of the default size when neither is asked for", () => {
        for (const [page, limit] of [
            [undefined, undefined],
            ["", ""],
            [null, undefined],
            [NaN, NaN]
        ]) {
            expect(getPaging(page, limit)).toEqual({ page: 1, limit: itemsPerPage });
        }
    });

    it("gives the first page of the default size when only one is asked for", () => {
        expect(getPaging(undefined, "10")).toEqual({ page: 1, limit: 10 });
        expect(getPaging("4", undefined)).toEqual({ page: 4, limit: itemsPerPage });
    });
});

describe("getFromTo", () => {
    it("adds a LIMIT with the offset of the page", () => {
        expect(getFromTo("SELECT 1", "3", "20")).toMatch(/LIMIT 40, 20\s*$/);
        expect(getFromTo("SELECT 1", "1", "20")).toMatch(/LIMIT 0, 20\s*$/);
    });

    it("always adds a LIMIT, whatever the input", () => {
        for (const [page, limit] of [
            [undefined, undefined],
            ["0", "1000000"],
            ["abc", "abc"],
            ["1; DROP TABLE users", "10 OR 1=1"]
        ]) {
            const sql = getFromTo("SELECT 1", page, limit);

            expect(sql, `${page} / ${limit}`).toMatch(/LIMIT \d+, \d+\s*$/);
            expect(sql).not.toMatch(/DROP|OR 1=1/);
        }
    });

    it("cannot be asked for more than the largest page, nor for everything without paging", () => {
        expect(getFromTo("SELECT 1", "1", "1000000")).toMatch(
            new RegExp(`LIMIT 0, ${maxItemsPerPage}\\s*$`)
        );
        expect(getFromTo("SELECT 1", undefined, undefined)).toMatch(
            new RegExp(`LIMIT 0, ${itemsPerPage}\\s*$`)
        );
    });
});

describe("applyPaging", () => {
    it("uses an already checked page as it is", () => {
        expect(applyPaging("SELECT 1", { page: 3, limit: 7 })).toMatch(/LIMIT 14, 7\s*$/);
    });
});

describe("applyPaging with a marker", () => {
    it("puts the LIMIT where the marker is, once, and nowhere else", () => {
        const sql = `SELECT * FROM (SELECT id FROM t ${limitMarker}) p ORDER BY id`;
        const paged = applyPaging(sql, { page: 2, limit: 10 });

        expect(paged).toBe("SELECT * FROM (SELECT id FROM t LIMIT 10, 10) p ORDER BY id");
    });

    it("still adds the LIMIT at the end of a statement without one", () => {
        expect(applyPaging("SELECT 1", { page: 1, limit: 5 })).toMatch(
            /^SELECT 1\s+LIMIT 0, 5\s*$/
        );
    });

    it("is not confused by a LIMIT that is not the marker's", () => {
        expect(getFromTo(`SELECT 1 ${limitMarker}`, "2", "20")).toBe("SELECT 1 LIMIT 20, 20");
    });
});

describe("keywordWhere", () => {
    const search = (keyword: string, table: SearchTable = "customers", extra = {}) =>
        keywordWhere({ keyword, table, ...extra });

    it("needs every word to match, and a word to match in any searched column", () => {
        const { sql, params } = search("foo bar");

        expect(sql).toBe(
            "WHERE (customers.name LIKE ? OR customers.contact LIKE ?) AND (customers.name LIKE ? OR customers.contact LIKE ?)"
        );
        expect(params).toEqual(["%foo%", "%foo%", "%bar%", "%bar%"]);
    });

    it("keeps each word's columns together, so no word's OR escapes the AND between words", () => {
        // Without the parentheses "a OR b AND c OR d" matched everything that had the first word
        for (const table of [
            "customers",
            "products",
            "users",
            "invoices",
            "worksheets"
        ] as SearchTable[]) {
            const { sql } = search("one two three", table);
            const groups = sql.replace("WHERE ", "").split(" AND ");

            expect(groups, table).toHaveLength(3);
            for (const group of groups) {
                expect(group, table).toMatch(/^\(.*\)$/);
            }
        }
    });

    it("gives no condition for an empty keyword or one made of spaces", () => {
        for (const keyword of ["", " ", "   "]) {
            expect(search(keyword), JSON.stringify(keyword)).toEqual({ sql: "", params: [] });
        }

        expect(keywordWhere({ keyword: null, table: "customers" })).toEqual({
            sql: "",
            params: []
        });
    });

    it("can continue a WHERE that already exists", () => {
        expect(search("foo", "invoices", { prefix: "AND" }).sql).toMatch(/^AND \(/);
    });

    it("searches the columns of each table", () => {
        expect(search("x", "products").sql).toContain(
            "products.code LIKE ? OR products.name LIKE ?"
        );
        expect(search("x", "users").sql).toContain("users.username LIKE ? OR users.name LIKE ?");
        expect(search("x", "invoices").sql).toContain(
            "customers.name LIKE ? OR invoices.customer_name LIKE ? OR invoices.number LIKE ?"
        );
        expect(search("x", "worksheets", { customer: true }).sql).toContain("products.name LIKE ?");
    });

    it("treats % and _ in a word as text, not as LIKE wildcards", () => {
        expect(search("50%").params[0]).toBe("%50\\%%");
        expect(search("a_b").params[0]).toBe("%a\\_b%");
        expect(search("back\\slash").params[0]).toBe("%back\\\\slash%");
    });

    it("decodes a URL-encoded keyword and survives a stray %", () => {
        expect(search("foo%20bar").params).toEqual(["%foo%", "%foo%", "%bar%", "%bar%"]);
        expect(() => search("100%")).not.toThrow();
        expect(search("100%").params[0]).toBe("%100\\%%");
    });

    it("uses the first words only, so a search cannot be made expensive", () => {
        const words = Array.from({ length: 3000 }, (_, index) => `w${index}`);
        const { sql, params } = search(words.join(" "));

        // two columns per word on customers
        expect(params).toHaveLength(maxKeywordWords * 2);
        expect(sql.match(/LIKE \?/g)).toHaveLength(maxKeywordWords * 2);
        expect(params[0]).toBe("%w0%");
        expect(params.at(-1)).toBe(`%w${maxKeywordWords - 1}%`);
        expect(params).not.toContain(`%w${maxKeywordWords}%`);
    });

    it("counts words that are not empty: extra spaces do not use up the limit", () => {
        const { params } = search(`${"  ".repeat(50)}a${" ".repeat(20)}b`);

        expect(params).toEqual(["%a%", "%a%", "%b%", "%b%"]);
    });

    it("cuts a word to the longest length and keeps whole characters", () => {
        const [pattern] = search("x".repeat(500)).params;

        expect(pattern).toBe(`%${"x".repeat(maxKeywordLength)}%`);

        // an emoji is one character, not two halves
        const [emoji] = search("😀".repeat(maxKeywordLength + 10)).params;

        expect(emoji).toBe(`%${"😀".repeat(maxKeywordLength)}%`);
    });

    it("limits a keyword that is long and URL-encoded as well", () => {
        const { params } = search(encodeURIComponent(Array(100).fill("abc").join(" ")));

        expect(params).toHaveLength(maxKeywordWords * 2);
    });

    it("keeps the limits for every table", () => {
        const keyword = Array.from({ length: 50 }, (_, index) => `word${index}`).join(" ");

        for (const table of [
            "customers",
            "products",
            "users",
            "invoices",
            "worksheets"
        ] as SearchTable[]) {
            const { sql } = search(keyword, table);

            expect(sql.split(" AND "), table).toHaveLength(maxKeywordWords);
        }
    });
});

describe("keywordWords", () => {
    it("gives the words, in order, without empty ones", () => {
        expect(keywordWords("  foo   bar ")).toEqual(["foo", "bar"]);
        expect(keywordWords("")).toEqual([]);
    });
});

describe("getInvoices", () => {
    const placeholders = (sql: string) => (sql.match(/\?/g) ?? []).length;

    it("filters the page and the total the same way, with the params both need", () => {
        for (const filter of [
            {},
            { customerId: 7 },
            { keyword: "ann" },
            { keyword: "ann 2024" },
            { customerId: 7, keyword: "ann 2024" }
        ]) {
            const { sql, totalSql, params } = getInvoices({ tenantId: 3, ...filter });

            expect(placeholders(sql), JSON.stringify(filter)).toBe(params.length);
            expect(placeholders(totalSql), JSON.stringify(filter)).toBe(params.length);
        }
    });

    it("has one WHERE, also for a customer and a keyword together", () => {
        const { sql, totalSql, params } = getInvoices({
            tenantId: 3,
            customerId: 7,
            keyword: "ann 2"
        });

        for (const statement of [sql, totalSql]) {
            // not counting the line-count subquery, which has a WHERE of its own
            const outer = statement.replace(/\(SELECT COUNT\(\*\)[\s\S]*?\) AS total/, "");

            expect(outer.match(/\bWHERE\b/g)).toHaveLength(1);
            expect(statement).toMatch(
                /WHERE invoices\.tenant_id = \?\s+AND invoices\.customer_id = \? AND \(customers\.name LIKE \?/
            );
        }

        expect(params).toEqual([3, 7, "%ann%", "%ann%", "%ann%", "%2%", "%2%", "%2%"]);
    });

    it("counts only the customer's invoices when asked for one customer", () => {
        expect(getInvoices({ tenantId: 3, customerId: 7 }).totalSql).toContain("customer_id = ?");
    });

    it("lists the newest number first, with the id as tie-break, and counts lines per page row", () => {
        for (const filter of [{}, { customerId: 7 }, { keyword: "ann" }]) {
            const { sql } = getInvoices({ tenantId: 3, ...filter });

            expect(sql, JSON.stringify(filter)).toMatch(
                /ORDER BY (invoices\.number_sort DESC, invoices\.id DESC|p\.number_sort DESC, p\.id DESC)\s*$/
            );
            expect(sql).toContain("(SELECT COUNT(*)");
            expect(sql).not.toMatch(/GROUP BY|number \+ 0/);
        }
    });

    it("picks the page first, from the index, and joins only its rows, when there is no keyword", () => {
        for (const filter of [{}, { customerId: 7 }]) {
            const { sql } = getInvoices({ tenantId: 3, ...filter });
            const inner = sql.slice(sql.indexOf("FROM (") + 6, sql.indexOf(") p"));

            // the rows of the page are picked from invoices alone: no customers, no line count
            expect(inner, JSON.stringify(filter)).toMatch(
                /^SELECT id, number_sort\s+FROM invoices/
            );
            expect(inner).not.toMatch(/customers|invoice_items/);
            expect(inner).toMatch(/ORDER BY number_sort DESC, id DESC\s+\/\* LIMIT \*\/$/);
            // and then joined by id, in the same order
            expect(sql).toMatch(/\) p\s+JOIN invoices ON invoices\.id = p\.id/);
            expect(sql).toMatch(
                /LEFT JOIN customers ON customers\.tenant_id = invoices\.tenant_id\s+AND customers\.id = invoices\.customer_id/
            );
            expect(sql).toMatch(/ORDER BY p\.number_sort DESC, p\.id DESC\s*$/);
        }

        expect(getInvoices({ tenantId: 3, customerId: 7 }).sql).toMatch(
            /FROM invoices\s+WHERE tenant_id = \?\s+AND invoices\.customer_id = \?\s+ORDER BY number_sort DESC, id DESC/
        );
    });

    it("keeps the join before the page when a keyword searches the customers' names", () => {
        const { sql } = getInvoices({ tenantId: 3, keyword: "ann" });

        expect(sql).not.toContain(limitMarker);
        expect(sql).not.toMatch(/\) p\b/);
        expect(sql).toMatch(
            /FROM invoices\s+LEFT JOIN customers ON customers\.tenant_id = invoices\.tenant_id\s+AND customers\.id = invoices\.customer_id\s+WHERE/
        );
    });

    it("gets its LIMIT inside the page query, or at the end after a keyword search", () => {
        const paging = { page: 3, limit: 20 };
        const deferred = applyPaging(getInvoices({ tenantId: 3 }).sql, paging);

        expect(deferred).toMatch(/ORDER BY number_sort DESC, id DESC\s+LIMIT 40, 20\) p/);
        expect(deferred).not.toContain(limitMarker);
        // nothing after the outer ORDER BY
        expect(deferred).toMatch(/ORDER BY p\.number_sort DESC, p\.id DESC\s*$/);

        expect(applyPaging(getInvoices({ tenantId: 3, keyword: "ann" }).sql, paging)).toMatch(
            /ORDER BY invoices\.number_sort DESC, invoices\.id DESC\s+LIMIT 40, 20\s*$/
        );
    });

    it("only joins customers to count when a keyword searches their names", () => {
        expect(getInvoices({ tenantId: 3 }).totalSql).not.toContain("customers");
        expect(getInvoices({ tenantId: 3, keyword: "ann" }).totalSql).toContain(
            "LEFT JOIN customers"
        );
    });
});

describe("getWorksheets grouped by customer", () => {
    const placeholders = (sql: string) => (sql.match(/\?/g) ?? []).length;

    it("groups on the worksheets alone and joins the page's customers after, without a keyword", () => {
        const { sql, totalSql, params } = getWorksheets({ tenantId: 3 });

        expect(sql).toMatch(
            /FROM \(SELECT customer_id,\s+COUNT\(\*\)\s+AS worksheet_count,\s+MAX\(id\)\s+AS last_id\s+FROM worksheets\s+WHERE tenant_id = \?\s+GROUP BY customer_id\s+ORDER BY last_id DESC\s+\/\* LIMIT \*\/\) g/
        );
        expect(sql).toMatch(
            /JOIN customers ON customers\.id = g\.customer_id\s+ORDER BY g\.last_id DESC\s*$/
        );
        expect(sql).toMatch(/SELECT customers\.name,\s+customers\.id,\s+g\.worksheet_count/);
        expect(params).toEqual([3]);
        expect(placeholders(sql)).toBe(1);
        expect(placeholders(totalSql)).toBe(1);
    });

    it("counts the customers that have worksheets, which is what the list has a row for", () => {
        expect(getWorksheets({ tenantId: 3 }).totalSql).toMatch(
            /SELECT COUNT\(\*\) AS total\s+FROM \(SELECT tenant_id, customer_id\s+FROM worksheets\s+WHERE tenant_id = \?\s+GROUP BY tenant_id, customer_id\) c\s*$/
        );
        expect(getWorksheets({ tenantId: 3, keyword: "ann" }).totalSql).toContain(
            "COUNT(DISTINCT worksheets.customer_id)"
        );
        expect(getWorksheets({ tenantId: 3 }).totalSql).not.toContain("customers.name");
    });

    it("gets its LIMIT inside the grouped query", () => {
        const paged = applyPaging(getWorksheets({ tenantId: 3 }).sql, { page: 2, limit: 20 });

        expect(paged).toMatch(/ORDER BY last_id DESC\s+LIMIT 20, 20\) g/);
        expect(paged).toMatch(/ORDER BY g\.last_id DESC\s*$/);
    });

    it("joins the customers first when a keyword searches their names", () => {
        const { sql, totalSql, params } = getWorksheets({ tenantId: 3, keyword: "ann 2" });

        for (const statement of [sql, totalSql]) {
            expect(statement).toMatch(
                /LEFT JOIN customers ON worksheets\.customer_id = customers\.id\s+WHERE worksheets\.tenant_id = \?\s+AND \(customers\.name LIKE \?\) AND \(customers\.name LIKE \?\)/
            );
            expect(placeholders(statement)).toBe(params.length);
        }

        expect(sql).toMatch(
            /GROUP BY customers\.name, customers\.id\s+ORDER BY MAX\(worksheets\.id\) DESC\s*$/
        );
        expect(sql).not.toContain(limitMarker);
        expect(params).toEqual([3, "%ann%", "%2%"]);
    });

    it("leaves the worksheets of one customer as they were", () => {
        const { sql, totalSql, params } = getWorksheets({ tenantId: 3, customerId: 7 });

        expect(sql).toContain("worksheets.customer_id = ?");
        expect(sql).toMatch(/ORDER BY worksheets\.id DESC\s*$/);
        expect(sql).not.toContain(limitMarker);
        expect(totalSql).toContain("COUNT(worksheets.id)");
        expect(params).toEqual([3, 7]);
    });
});

describe("every list filters by the caller's company first", () => {
    const placeholders = (sql: string) => (sql.match(/\?/g) ?? []).length;
    const getters = { getCustomers, getProducts, getUsers, getInvoices, getWorksheets };
    const filters = [
        {},
        { keyword: "ann 2" },
        { customerId: 7 },
        { customerId: 7, keyword: "ann" }
    ];

    for (const [name, getter] of Object.entries(getters)) {
        it(`${name}: the page and the total, with and without a keyword or customer`, () => {
            for (const filter of filters) {
                const { sql, totalSql, params } = getter({ tenantId: 5, ...filter });
                const label = `${name} ${JSON.stringify(filter)}`;

                expect(params[0], label).toBe(5);
                expect(sql, label).toMatch(/\btenant_id = \?/);
                expect(totalSql, label).toMatch(/\btenant_id = \?/);
                // the company's ? is the first one in both, so params[0] lands on it
                expect(sql.indexOf("tenant_id = ?"), label).toBeLessThanOrEqual(sql.indexOf("?"));
                expect(totalSql.indexOf("tenant_id = ?"), label).toBeLessThanOrEqual(
                    totalSql.indexOf("?")
                );
                expect(placeholders(totalSql), label).toBe(params.length);
            }
        });
    }
});

describe("pageMeta", () => {
    it("answers the page asked for while it has rows", () => {
        expect(pageMeta({ page: 2, limit: 15 }, 40)).toEqual({
            page: 2,
            pages: 3,
            rows: 40,
            limit: 15
        });
    });

    it("answers the last page for a page past the end", () => {
        expect(pageMeta({ page: 999, limit: 15 }, 40)).toMatchObject({ page: 3, pages: 3 });
    });

    it("answers page 1 and no pages when nothing matches", () => {
        expect(pageMeta({ page: 5, limit: 15 }, 0)).toEqual({
            page: 1,
            pages: 0,
            rows: 0,
            limit: 15
        });
    });

    it("counts a last page that is not full", () => {
        expect(pageMeta({ page: 1, limit: 15 }, 15).pages).toBe(1);
        expect(pageMeta({ page: 1, limit: 15 }, 16).pages).toBe(2);
    });
});

describe("getWorksheets for one customer", () => {
    it("counts the same rows it lists, paid (locked) worksheets too", () => {
        const { sql, totalSql } = getWorksheets({ tenantId: 1, customerId: 9 });

        expect(sql).not.toMatch(/locked\s*!=/);
        expect(totalSql).not.toMatch(/locked\s*!=/);
    });
});
