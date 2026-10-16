import { describe, expect, it } from "vitest";
import { config } from "../config/config";
import { applyPaging, getFromTo, getPaging } from "./_getters";

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
