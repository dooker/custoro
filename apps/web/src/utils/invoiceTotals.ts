// The money on an invoice, counted in whole cents, so the screen and the PDF print numbers that
// add up. A copy of apps/api/helpers/invoiceTotals.ts; both run its invoiceTotals.cases.json.
//
// Prices have up to 4 decimals and quantities up to 3 (DECIMAL(12,4) and DECIMAL(12,3)). Each line
// is rounded to cents, half away from zero; the net is the sum of the rounded lines; the VAT is the
// net times the rate, rounded the same way; the total is net plus VAT. Before, the lines were
// added as floating point numbers and only the printed values were rounded, so the printed lines
// often did not add up to the printed net, nor net plus VAT to the printed total (a cent off).

export type Amount = number | string | null | undefined;

export interface InvoiceLineAmounts {
    price: Amount;
    quantity: Amount;
}

/** In cents */
export interface InvoiceTotals {
    lines: number[];
    net: number;
    vat: number;
    total: number;
}

const roundHalfAway = (value: number) => Math.sign(value) * Math.round(Math.abs(value));

/** value as a whole number of 10^-decimals units (2.5 with 4 decimals is 25000); 0 if not a number */
const scaled = (value: Amount, decimals: number): bigint => {
    const number = Number(value);

    if (value === null || value === undefined || value === '' || !Number.isFinite(number)) {
        return 0n;
    }

    return BigInt(roundHalfAway(number * 10 ** decimals));
};

/** dividend / divisor rounded half away from zero, divisor > 0 */
const divideRounded = (dividend: bigint, divisor: bigint): bigint => {
    const negative = dividend < 0n;
    const quotient = ((negative ? -dividend : dividend) * 2n + divisor) / (2n * divisor);

    return negative ? -quotient : quotient;
};

/** price x quantity in cents: (10^-4 x 10^-3) / 10^-2 = 10^5 */
export const lineCents = ({ price, quantity }: InvoiceLineAmounts): number =>
    Number(divideRounded(scaled(price, 4) * scaled(quantity, 3), 100000n));

/** vatRate in percent (24 is 24 %); noVat for a customer with a foreign VAT number */
export const invoiceTotals = (
    items: InvoiceLineAmounts[] | null | undefined,
    vatRate: Amount,
    noVat = false
): InvoiceTotals => {
    const lines = (items ?? []).map(lineCents);
    const net = lines.reduce((sum, cents) => sum + cents, 0);
    // rate in hundredths of a percent: net x rate / 100 = net x scaled / 10^4
    const vat = noVat ? 0 : Number(divideRounded(BigInt(net) * scaled(vatRate, 2), 10000n));

    return { lines, net, vat, total: net + vat };
};

/** 12345 -> "123.45", -5 -> "-0.05" */
export const formatCents = (cents: number): string => {
    const whole = Math.round(Math.abs(cents));
    const sign = cents < 0 && whole > 0 ? '-' : '';

    return `${sign}${Math.floor(whole / 100)}.${String(whole % 100).padStart(2, '0')}`;
};

/** A unit price with the decimals it has, at least 2 and at most 4: 33.3 -> "33.30", 1.2345 -> "1.2345" */
export const formatPrice = (price: Amount): string => {
    const units = Number(scaled(price, 4));
    const whole = Math.abs(units);
    const sign = units < 0 ? '-' : '';
    const fraction = String(whole % 10000)
        .padStart(4, '0')
        .replace(/0{1,2}$/, '');

    return `${sign}${Math.floor(whole / 10000)}.${fraction}`;
};
