import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { companyName, companySeed, companySeedRows } from "./companySeed";

describe("companySeedRows", () => {
    it("are the settings db/02-seed.sql gives company 1, in the same order", () => {
        const seed = fs.readFileSync(path.join(import.meta.dirname, "../db/02-seed.sql"), "utf8");
        const rows = [...seed.matchAll(/^\(1, '([^']*)', '([^']*)', ''\)[,;]$/gm)].map(
            ([, name, value]) => [name, value]
        );

        expect(rows.length).toBeGreaterThan(15);
        expect(companySeedRows).toEqual(rows);
    });

    it("puts the company's name into companyName and nowhere else", () => {
        const rows = Object.fromEntries(companySeed("Acme OÜ"));

        expect(rows.companyName).toBe("Acme OÜ");
        expect(rows.lastInvoiceId).toBe("0");
        expect(rows.invoiceFilenamePrefix).toBe("invoice_");
    });
});

describe("companyName", () => {
    it("takes a name of one line, trimmed", () => {
        expect(companyName("  East Side Customs OÜ ")).toBe("East Side Customs OÜ");
    });

    it.each([
        ["", "empty"],
        ["   ", "only spaces"],
        ["a\nb", "two lines"],
        ["x".repeat(151), "too long"]
    ])("refuses %j (%s)", (value) => {
        expect(companyName(value)).toBeNull();
    });

    it("refuses what is not text", () => {
        expect(companyName(5)).toBeNull();
        expect(companyName(undefined)).toBeNull();
    });
});
