import { describe, expect, it } from "vitest";
import { isForeignVatNumber, normalizeVatNumber } from "./foreignVatNumber";
import shared from "./foreignVatNumber.cases.json";

describe("isForeignVatNumber", () => {
    it.each(shared.cases)("$value is foreign: $foreign ($note)", ({ value, foreign }) => {
        expect(isForeignVatNumber(value)).toBe(foreign);
    });

    it("treats undefined as no VAT number", () => {
        expect(isForeignVatNumber(undefined)).toBe(false);
    });
});

describe("normalizeVatNumber", () => {
    it("uppercases and drops spaces, dots and dashes", () => {
        expect(normalizeVatNumber(" de 123.456-789 ")).toBe("DE123456789");
    });

    it("keeps other characters so placeholders stay invalid", () => {
        expect(normalizeVatNumber("n/a")).toBe("N/A");
    });
});
