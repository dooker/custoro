import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { invalidIdMessage, isRowId, requireIds, requireParams } from "./routeParams";

describe("isRowId", () => {
    it("takes digits for a positive whole number up to the largest INT", () => {
        for (const id of ["1", "5", "42", "1000", "2147483647"]) {
            expect(isRowId(id), id).toBe(true);
        }
    });

    it("refuses what MySQL would read by its leading digits, and anything else that is not an id", () => {
        for (const id of [
            "0",
            "-1",
            "+1",
            "01",
            "1e3",
            "1.5",
            "1 OR 1=1",
            "1;DROP TABLE users",
            "1'",
            " 1",
            "1 ",
            "",
            " ",
            "abc",
            "0x10",
            "2147483648",
            "99999999999",
            "٣"
        ]) {
            expect(isRowId(id), JSON.stringify(id)).toBe(false);
        }
    });

    it("refuses what is not text: Express gives a list for a wildcard, and nothing for a missing parameter", () => {
        for (const id of [undefined, null, 5, ["5"], { a: "5" }, true]) {
            expect(isRowId(id), JSON.stringify(id)).toBe(false);
        }
    });
});

describe("requireParams", () => {
    const run = (middleware: ReturnType<typeof requireIds>, params: Record<string, string>) => {
        const next = vi.fn();
        const json = vi.fn();

        middleware({ params } as unknown as Request, { json } as unknown as Response, next);

        return { next, json };
    };

    it("lets the request through when its path parameters are valid", () => {
        const { next, json } = run(requireIds("id", "invoiceId"), { id: "5", invoiceId: "12" });

        expect(next).toHaveBeenCalledOnce();
        expect(json).not.toHaveBeenCalled();
    });

    it("answers success: false with a message the web app knows, and does not go on", () => {
        const { next, json } = run(requireIds("id"), { id: "1 OR 1=1" });

        expect(next).not.toHaveBeenCalled();
        expect(json).toHaveBeenCalledWith({ success: false, message: invalidIdMessage });
        expect(invalidIdMessage).toBe("error");
    });

    it("refuses when one of several ids is bad, or one is missing", () => {
        expect(
            run(requireIds("id", "invoiceId"), { id: "5", invoiceId: "x" }).next
        ).not.toHaveBeenCalled();
        expect(run(requireIds("id", "invoiceId"), { id: "5" }).next).not.toHaveBeenCalled();
    });

    it("takes any rule over the parameters", () => {
        const either = requireParams(({ page }) => page === "all" || isRowId(page));

        expect(run(either, { page: "all" }).next).toHaveBeenCalledOnce();
        expect(run(either, { page: "7" }).next).toHaveBeenCalledOnce();
        expect(run(either, { page: "some" }).next).not.toHaveBeenCalled();
    });
});
