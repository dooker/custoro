import { describe, expect, it } from "vitest";
import { dateText, decimal, oneOf, parseInput, rowId, text, whole } from "./bodyInput";

const refused = { ok: false, message: "invalidInput" };

// The value a rule gives for `input`, or "refused"
const run = (rule: (value: unknown) => unknown, input: unknown) => {
    const parsed = parseInput({ field: input }, { field: rule as never });

    return parsed.ok ? (parsed.values as { field: unknown }).field : "refused";
};

describe("text", () => {
    it("takes text up to the length of the column, counted in characters", () => {
        expect(run(text(5), "hello")).toBe("hello");
        expect(run(text(5), "hello!")).toBe("refused");
        // an emoji is one character, the column holds it as one
        expect(run(text(3), "😀😀😀")).toBe("😀😀😀");
        expect(run(text(3), "😀😀😀😀")).toBe("refused");
    });

    it("does not change the text it takes", () => {
        expect(run(text(20), "  spaced  ")).toBe("  spaced  ");
        expect(run(text(20), "")).toBe("");
    });

    it("refuses arrays, objects and booleans, which mysql2 would turn into SQL or odd text", () => {
        for (const value of [{ a: 1 }, [["x"]], ["x"], [], true, () => "x", Symbol("x")]) {
            expect(run(text(50), value), String(JSON.stringify(value))).toBe("refused");
        }
    });

    it("takes a number as text, but not NaN or Infinity", () => {
        expect(run(text(20), 5551234)).toBe("5551234");
        expect(run(text(20), Number.NaN)).toBe("refused");
        expect(run(text(20), Number.POSITIVE_INFINITY)).toBe("refused");
    });

    it("gives the empty value for a missing field: the empty text, or null for a column that can be NULL", () => {
        expect(run(text(5), undefined)).toBe("");
        expect(run(text(5), null)).toBe("");
        expect(run(text(5, { empty: null }), undefined)).toBeNull();
        expect(run(text(5, { empty: null }), null)).toBeNull();
        // empty text is a value, not a missing field
        expect(run(text(5, { empty: null }), "")).toBe("");
    });

    it("can remove the spaces at the ends, before it counts the length and keeps the text", () => {
        const trimmed = text(5, { required: true, notBlank: true, trim: true });

        expect(run(trimmed, "42 ")).toBe("42");
        expect(run(trimmed, " 42")).toBe("42");
        expect(run(trimmed, "\t42\n")).toBe("42");
        expect(run(trimmed, "4 2")).toBe("4 2");
        // 5 characters once the spaces are gone
        expect(run(trimmed, "  12345  ")).toBe("12345");
        expect(run(trimmed, "123456")).toBe("refused");
        expect(run(trimmed, "   ")).toBe("refused");
        expect(run(text(5, { trim: true }), "  ")).toBe("");
    });

    it("can insist on the field being there, and on it not being blank", () => {
        expect(run(text(5, { required: true }), undefined)).toBe("refused");
        expect(run(text(5, { required: true }), null)).toBe("refused");
        expect(run(text(5, { required: true }), "")).toBe("");
        expect(run(text(5, { required: true, notBlank: true }), "")).toBe("refused");
        expect(run(text(5, { required: true, notBlank: true }), "  ")).toBe("refused");
        expect(run(text(5, { required: true, notBlank: true }), "a")).toBe("a");
    });
});

describe("whole", () => {
    it("takes whole numbers, sent as numbers or as text", () => {
        expect(run(whole(), 14)).toBe(14);
        expect(run(whole(), "14")).toBe(14);
        expect(run(whole(), " 14 ")).toBe(14);
        expect(run(whole({ min: -128 }), "-5")).toBe(-5);
    });

    it("refuses anything else, also things Number() would turn into a number", () => {
        for (const value of [
            1.5,
            "1.5",
            "1e3",
            "0x10",
            "abc",
            "1 OR 1=1",
            "1;DROP TABLE users",
            [5],
            ["5"],
            { a: 5 },
            true,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            "12345678901234567890"
        ]) {
            expect(run(whole(), value), String(JSON.stringify(value))).toBe("refused");
        }
    });

    it("keeps to the range", () => {
        expect(run(whole({ max: 3650 }), 3650)).toBe(3650);
        expect(run(whole({ max: 3650 }), 3651)).toBe("refused");
        expect(run(whole(), -1)).toBe("refused");
        expect(run(whole({ min: -128, max: 127 }), 128)).toBe("refused");
    });

    it("counts a missing field and blank text as missing", () => {
        expect(run(whole(), undefined)).toBeNull();
        expect(run(whole(), null)).toBeNull();
        expect(run(whole(), "")).toBeNull();
        expect(run(whole({ empty: 14 }), "")).toBe(14);
        expect(run(whole({ required: true }), "")).toBe("refused");
        expect(run(whole({ required: true }), undefined)).toBe("refused");
    });
});

describe("rowId", () => {
    it("takes a positive whole number", () => {
        expect(run(rowId(), 7)).toBe(7);
        expect(run(rowId(), "7")).toBe(7);
        expect(run(rowId(), 0)).toBe("refused");
        expect(run(rowId(), -1)).toBe("refused");
        expect(run(rowId(), 2147483648)).toBe("refused");
        expect(run(rowId(), [7])).toBe("refused");
    });

    it("is null when missing, unless it is required", () => {
        expect(run(rowId(), undefined)).toBeNull();
        expect(run(rowId({ required: true }), undefined)).toBe("refused");
    });
});

describe("decimal", () => {
    const price = decimal({ maxAbs: 1e8, scale: 4 });

    it("takes numbers and numeric text, with a comma or a point", () => {
        expect(run(price, 19.99)).toBe(19.99);
        expect(run(price, "19.99")).toBe(19.99);
        expect(run(price, "19,99")).toBe(19.99);
        expect(run(price, " 5 ")).toBe(5);
        expect(run(price, "-2.5")).toBe(-2.5);
        expect(run(price, 0.0125)).toBe(0.0125);
    });

    it("refuses what is not a number, or does not fit the column", () => {
        for (const value of [
            "abc",
            "1.2.3",
            "1,2,3",
            "1e3",
            "19,99 EUR",
            [1],
            { a: 1 },
            true,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            1e8,
            -1e8
        ]) {
            expect(run(price, value), String(JSON.stringify(value))).toBe("refused");
        }

        expect(run(price, 99999999.9999)).toBe(99999999.9999);
    });

    it("refuses a value that the database would round up to a number the column cannot hold", () => {
        // DECIMAL(12,4): 8 digits before the point
        for (const value of [
            99999999.99995,
            99999999.99999,
            "99999999.99996",
            -99999999.99999,
            1e8
        ]) {
            expect(run(price, value), String(value)).toBe("refused");
        }

        // these round to 99999999.9999 or stay below it, which fits; the value is given back as sent
        for (const value of [99999999.9999, 99999999.99994, "99999999.99994", -99999999.9999]) {
            expect(run(price, value), String(value)).toBe(Number(value));
        }
    });

    it("looks at the decimals of the column it is for", () => {
        // DECIMAL(12,3): 9 digits before the point and 3 after it
        const quantity = decimal({ maxAbs: 1e9, scale: 3 });

        expect(run(quantity, 999999999.999)).toBe(999999999.999);
        expect(run(quantity, 999999999.9994)).toBe(999999999.9994);
        expect(run(quantity, 999999999.9995)).toBe("refused");
        expect(run(quantity, 999999999.9996)).toBe("refused");
        expect(run(quantity, "-999999999.9999")).toBe("refused");
        // the same number is fine in a column with more room after the point
        expect(run(price, 999999.9999)).toBe(999999.9999);
        // and a small one is rounded by the database, not refused
        expect(run(quantity, 0.0004)).toBe(0.0004);
        expect(run(quantity, 1.2345)).toBe(1.2345);
    });

    it("counts a missing field and blank text as 0, or as the empty value of the rule", () => {
        expect(run(price, undefined)).toBe(0);
        expect(run(price, null)).toBe(0);
        expect(run(price, "  ")).toBe(0);
        expect(run(decimal({ maxAbs: 10, scale: 2, empty: null }), "")).toBeNull();
        expect(run(decimal({ maxAbs: 10, scale: 2, required: true }), "")).toBe("refused");
    });
});

describe("oneOf", () => {
    const unit = oneOf(["pc", "set"] as const, { empty: "pc" });

    it("takes the listed values, spelled exactly", () => {
        expect(run(unit, "set")).toBe("set");
        expect(run(unit, "SET")).toBe("refused");
        expect(run(unit, "tk")).toBe("refused");
        expect(run(unit, ["set"])).toBe("refused");
        expect(run(unit, { 0: "set" })).toBe("refused");
        expect(run(unit, 1)).toBe("refused");
    });

    it("gives the empty value for a missing field, or refuses it when required", () => {
        expect(run(unit, undefined)).toBe("pc");
        expect(run(oneOf(["a"] as const), undefined)).toBeNull();
        expect(run(oneOf(["a"] as const, { required: true }), undefined)).toBe("refused");
    });
});

describe("dateText", () => {
    it("takes dates that exist, with or without a time", () => {
        expect(run(dateText(), "2026-10-21")).toBe("2026-10-21");
        expect(run(dateText(), "2026-10-21 14:30:00")).toBe("2026-10-21 14:30:00");
        expect(run(dateText(), "2026-10-21T14:30")).toBe("2026-10-21T14:30");
        expect(run(dateText(), "2024-02-29")).toBe("2024-02-29");
    });

    it("refuses other text and dates that do not exist", () => {
        for (const value of [
            "2026-02-30",
            "2025-02-29",
            "2026-13-01",
            "2026-10-21 25:00:00",
            "21.10.2026",
            "2026-10-21; DROP TABLE users",
            "now",
            20261021,
            ["2026-10-21"],
            { a: 1 }
        ]) {
            expect(run(dateText(), value), String(JSON.stringify(value))).toBe("refused");
        }
    });

    it("is null when missing, unless required", () => {
        expect(run(dateText(), undefined)).toBeNull();
        expect(run(dateText({ required: true }), undefined)).toBe("refused");
    });
});

describe("parseInput", () => {
    const schema = { name: text(10, { required: true }), count: whole({ empty: 1 }) };

    it("gives the checked values of the fields in the schema, and ignores other fields", () => {
        expect(parseInput({ name: "a", count: "3", items: [{ a: 1 }], id: 9 }, schema)).toEqual({
            ok: true,
            values: { name: "a", count: 3 }
        });
    });

    it("refuses the whole body when one field is refused", () => {
        expect(parseInput({ name: { a: 1 }, count: 1 }, schema)).toEqual(refused);
        expect(parseInput({ name: "a", count: [1] }, schema)).toEqual(refused);
        expect(parseInput({ count: 1 }, schema)).toEqual(refused);
    });

    it("needs an object as the body: Express leaves it undefined when a request has none", () => {
        for (const body of [undefined, null, "name=a", 5, ["a"]]) {
            expect(parseInput(body, schema), String(JSON.stringify(body))).toEqual(refused);
        }
    });

    it("reads own fields only, never a prototype's", () => {
        const inherited = Object.create({ name: "from the prototype" });

        expect(parseInput(inherited, schema)).toEqual(refused);
        // multer and qs give bodies without a prototype
        expect(parseInput(Object.assign(Object.create(null), { name: "a" }), schema)).toEqual({
            ok: true,
            values: { name: "a", count: 1 }
        });
    });
});
