// A small validator for what the write routes (customer, product, worksheet, user, invoice)
// accept in a request body, without Express or the database, so it can be unit tested.
//
// Only the fields a schema names are read; anything else in the body (the web app sends whole
// drafts, with lists and dates the route does not store) is ignored. A named field has to be text,
// a number or an enum value as its rule says: an array or an object is refused, where mysql2 would
// have turned it into SQL (an array becomes a list of values, an object `key` = value pairs, and
// {"a":1} as a name was stored as the text "[object Object]").
//
// A field that is missing (or null) gets the rule's `empty` value, which is what the column holds
// when nobody fills it in; `required` makes it an error instead.

export const invalidInputMessage = "invalidInput";

const invalid = Symbol("invalid");

export type Rule<T> = (value: unknown) => T | typeof invalid;

const isMissing = (value: unknown) => value === undefined || value === null;

interface TextOptions {
    // The field has to be there (it may still be empty text, unless notBlank)
    required?: boolean;
    notBlank?: boolean;
    // The value of a missing field: null for a column that can be NULL, "" for one that cannot
    empty?: string | null;
}

// The value a rule gives: null only when the field may be missing and `empty` is null
type Given<O extends { required?: boolean; empty?: unknown }, T> = O extends { required: true }
    ? T
    : O extends { empty: null }
      ? T | null
      : T;

// Text up to `max` characters (the size of the column, counted like MySQL counts: by character).
// A finite number counts as text, like a phone number typed as a JSON number.
export const text = <const O extends TextOptions = Record<never, never>>(
    max: number,
    options?: O
): Rule<Given<O, string>> => {
    const { required = false, notBlank = false, empty = "" } = options ?? {};

    return ((value) => {
        if (isMissing(value)) {
            return required ? invalid : empty;
        }

        const result = typeof value === "number" && Number.isFinite(value) ? String(value) : value;

        if (typeof result !== "string" || (notBlank && result.trim() === "")) {
            return invalid;
        }

        return Array.from(result).length <= max ? result : invalid;
    }) as Rule<Given<O, string>>;
};

interface WholeOptions {
    min?: number;
    max?: number;
    required?: boolean;
    empty?: number | null;
}

// The value of a number rule whose missing value is `empty`: null unless a number is given
type GivenNumber<O extends { required?: boolean; empty?: unknown }> = O extends { required: true }
    ? number
    : O extends { empty: number }
      ? number
      : number | null;

// A whole number, sent as a number or as text (forms send text); blank text counts as missing
export const whole = <const O extends WholeOptions = Record<never, never>>(
    options?: O
): Rule<GivenNumber<O>> => {
    const { min = 0, max = 2147483647, required = false, empty = null } = options ?? {};

    return ((value) => {
        if (isMissing(value) || value === "") {
            return required ? invalid : empty;
        }

        const number =
            typeof value === "number"
                ? value
                : typeof value === "string" && /^[-+]?\d{1,15}$/.test(value.trim())
                  ? Number(value)
                  : Number.NaN;

        return Number.isInteger(number) && number >= min && number <= max ? number : invalid;
    }) as Rule<GivenNumber<O>>;
};

// A row id: 1 up to the largest INT
export const rowId = <const O extends Pick<WholeOptions, "required"> = Record<never, never>>(
    options?: O
): Rule<GivenNumber<O>> => whole({ min: 1, ...options }) as unknown as Rule<GivenNumber<O>>;

interface DecimalOptions {
    // The value has to be smaller than this (10^integer digits of the DECIMAL column)
    maxAbs: number;
    // The decimals of the column: DECIMAL(12,3) holds 9 digits before the point and 3 after it
    scale: number;
    required?: boolean;
    empty?: number | null;
}

// A decimal number, sent as a number or as text; text may use a comma ("19,99"). Blank text
// counts as missing, which is 0 unless the rule says otherwise. The value has to fit the column
// after the database has rounded it to the column's decimals (half away from zero): 999999999.9995
// is 1000000000.000 in a DECIMAL(12,3), which is too big. The value itself is given back as it is.
export const decimal = <const O extends DecimalOptions>(
    options: O
): Rule<O extends { empty: null } ? number | null : number> => {
    const { maxAbs, scale, required = false, empty = 0 } = options;

    return ((value) => {
        if (isMissing(value) || (typeof value === "string" && value.trim() === "")) {
            return required ? invalid : empty;
        }

        const number =
            typeof value === "number"
                ? value
                : typeof value === "string" && /^[-+]?(\d+([.,]\d*)?|[.,]\d+)$/.test(value.trim())
                  ? Number(value.trim().replace(",", "."))
                  : Number.NaN;

        // A value rounds up to maxAbs, which does not fit, when it is within half a unit of the last
        // decimal of it (an exact half rounds up)
        const limit = maxAbs - 0.5 / 10 ** scale;

        return Number.isFinite(number) && Math.abs(number) < limit ? number : invalid;
    }) as Rule<O extends { empty: null } ? number | null : number>;
};

interface OneOfOptions<T> {
    required?: boolean;
    empty?: T | null;
}

// One of the values of an ENUM column, spelled exactly
export const oneOf = <T extends string, const O extends OneOfOptions<T> = Record<never, never>>(
    values: readonly T[],
    options?: O
): Rule<O extends { required: true } ? T : O extends { empty: T } ? T : T | null> => {
    const { required = false, empty = null } = options ?? {};

    return ((value) => {
        if (isMissing(value)) {
            return required ? invalid : empty;
        }

        return typeof value === "string" && (values as readonly string[]).includes(value)
            ? value
            : invalid;
    }) as Rule<O extends { required: true } ? T : O extends { empty: T } ? T : T | null>;
};

const datePattern = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

// A date, "2026-10-21", optionally with a time ("2026-10-21 14:30:00"), that exists
export const dateText = <const O extends { required?: boolean } = Record<never, never>>(
    options?: O
): Rule<O extends { required: true } ? string : string | null> =>
    ((value) => {
        if (isMissing(value)) {
            return options?.required ? invalid : null;
        }

        const parts = typeof value === "string" ? datePattern.exec(value) : null;

        if (!parts) {
            return invalid;
        }

        // A time that is not there counts as midnight
        const [year, month, day, hour, minute, second] = parts
            .slice(1)
            .map((part) => (part === undefined ? 0 : Number(part)));
        const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
        const exists =
            date.getUTCFullYear() === year &&
            date.getUTCMonth() === month - 1 &&
            date.getUTCDate() === day &&
            hour < 24 &&
            minute < 60 &&
            second < 60;

        return exists ? value : invalid;
    }) as Rule<O extends { required: true } ? string : string | null>;

type Schema = Record<string, Rule<unknown>>;

export type InputValues<S extends Schema> = {
    [K in keyof S]: Exclude<ReturnType<S[K]>, typeof invalid>;
};

export type ParsedInputIF<S extends Schema> =
    { ok: true; values: InputValues<S> } | { ok: false; message: string };

// The fields of `schema`, checked and in the form the database takes. `body` itself must be an
// object (Express 5 leaves it undefined when a request has none).
export const parseInput = <S extends Schema>(body: unknown, schema: S): ParsedInputIF<S> => {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return { ok: false, message: invalidInputMessage };
    }

    const values: Record<string, unknown> = {};

    for (const [key, rule] of Object.entries(schema)) {
        // Own fields only, so "constructor" or "toString" in a schema never reads a prototype
        const result = rule(
            Object.hasOwn(body, key) ? (body as Record<string, unknown>)[key] : undefined
        );

        if (result === invalid) {
            return { ok: false, message: invalidInputMessage };
        }

        values[key] = result;
    }

    return { ok: true, values: values as InputValues<S> };
};
