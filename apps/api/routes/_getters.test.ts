import { describe, expect, it } from "vitest";
import { config } from "../config/config";
import { applyPaging, getFromTo, getInvoices, getPaging, keywordWhere } from "./_getters";

const { itemsPerPage, maxItemsPerPage, maxListRows } = config;

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

    it("gives the first rows, up to a cap, when neither is asked for", () => {
        for (const [page, limit] of [
            [undefined, undefined],
            ["", ""],
            [null, undefined],
            [NaN, NaN]
        ]) {
            expect(getPaging(page, limit)).toEqual({ page: 1, limit: maxListRows });
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

    it("cannot be asked for more than the largest page, or the list cap without paging", () => {
        expect(getFromTo("SELECT 1", "1", "1000000")).toMatch(
            new RegExp(`LIMIT 0, ${maxItemsPerPage}\\s*$`)
        );
        expect(getFromTo("SELECT 1", undefined, undefined)).toMatch(
            new RegExp(`LIMIT 0, ${maxListRows}\\s*$`)
        );
    });
});

describe("applyPaging", () => {
    it("uses an already checked page as it is, so the list cap is not cut to a page size", () => {
        expect(applyPaging("SELECT 1", { page: 1, limit: maxListRows })).toMatch(
            new RegExp(`LIMIT 0, ${maxListRows}\\s*$`)
        );
    });
});

describe("keywordWhere", () => {
    const search = (keyword: string, table = "customers", extra = {}) =>
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
        for (const table of ["customers", "products", "users", "invoices", "worksheets"]) {
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
            "customers.name LIKE ? OR invoices.number LIKE ?"
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
            const { sql, totalSql, params } = getInvoices(filter);

            expect(placeholders(sql), JSON.stringify(filter)).toBe(params.length);
            expect(placeholders(totalSql), JSON.stringify(filter)).toBe(params.length);
        }
    });

    it("has one WHERE, also for a customer and a keyword together", () => {
        const { sql, totalSql, params } = getInvoices({ customerId: 7, keyword: "ann 2" });

        for (const statement of [sql, totalSql]) {
            // not counting the line-count subquery, which has a WHERE of its own
            const outer = statement.replace(/\(SELECT COUNT\(\*\)[\s\S]*?\) AS total/, "");

            expect(outer.match(/\bWHERE\b/g)).toHaveLength(1);
            expect(statement).toContain("invoices.customer_id = ? AND (customers.name LIKE ?");
        }

        expect(params).toEqual([7, "%ann%", "%ann%", "%2%", "%2%"]);
    });

    it("counts only the customer's invoices when asked for one customer", () => {
        expect(getInvoices({ customerId: 7 }).totalSql).toContain("customer_id = ?");
    });

    it("lists the newest number first, with the id as tie-break, and counts lines per page row", () => {
        const { sql } = getInvoices({});

        expect(sql).toContain("ORDER BY invoices.number_sort DESC, invoices.id DESC");
        expect(sql).toContain("(SELECT COUNT(*)");
        expect(sql).not.toMatch(/GROUP BY|number \+ 0/);
    });

    it("only joins customers to count when a keyword searches their names", () => {
        expect(getInvoices({}).totalSql).not.toContain("customers");
        expect(getInvoices({ keyword: "ann" }).totalSql).toContain("LEFT JOIN customers");
    });
});
