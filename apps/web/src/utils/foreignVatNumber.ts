// Whether a customer's VAT number is foreign, which makes the invoice VAT-free (the seller is
// Estonian). The same rule lives in apps/api/helpers/foreignVatNumber.ts; both are tested against
// apps/api/helpers/foreignVatNumber.cases.json, so change them together.
//
// Placeholders such as "N/A" and Estonian numbers in any spelling are not foreign. EU numbers must
// match their country's format; numbers from outside the EU need a country prefix and 5+ digits.

// Formats after the country prefix, as published for the EU VIES service
const euVatFormats: Record<string, RegExp> = {
    AT: /^U\d{8}$/,
    BE: /^[01]\d{9}$/,
    BG: /^\d{9,10}$/,
    CY: /^\d{8}[A-Z]$/,
    CZ: /^\d{8,10}$/,
    DE: /^\d{9}$/,
    DK: /^\d{8}$/,
    EL: /^\d{9}$/,
    ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/,
    FI: /^\d{8}$/,
    FR: /^[A-Z0-9]{2}\d{9}$/,
    HR: /^\d{11}$/,
    HU: /^\d{8}$/,
    IE: /^\d[A-Z0-9+*]\d{5}[A-W][A-I]?$/,
    IT: /^\d{11}$/,
    LT: /^(\d{9}|\d{12})$/,
    LU: /^\d{8}$/,
    LV: /^\d{11}$/,
    MT: /^\d{8}$/,
    NL: /^\d{9}B\d{2}$/,
    PL: /^\d{10}$/,
    PT: /^\d{9}$/,
    RO: /^[1-9]\d{1,9}$/,
    SE: /^\d{10}01$/,
    SI: /^\d{8}$/,
    SK: /^\d{10}$/,
    XI: /^(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/,
};

// Uppercase, without the spaces, dots and dashes people type for readability
export const normalizeVatNumber = (value: string | null | undefined): string =>
    (value ?? '').toUpperCase().replace(/[\s.-]/g, '');

export const isForeignVatNumber = (value: string | null | undefined): boolean => {
    const normalized = normalizeVatNumber(value);
    const match = /^([A-Z]{2})([A-Z0-9+*]+)$/.exec(normalized);

    if (!match) return false;

    // Greece uses EL in VAT numbers, but GR is often typed
    const prefix = match[1] === 'GR' ? 'EL' : match[1];
    const rest = match[2];

    if (prefix === 'EE') return false;

    if (euVatFormats[prefix]) return euVatFormats[prefix].test(rest);

    return rest.length <= 18 && (rest.match(/\d/g) ?? []).length >= 5;
};
