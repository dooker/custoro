// The invoice list for the accountant (GET /export/invoices): pure rules, unit tested without a
// database. services/export.ts reads the rows.
import { formatCents, invoiceTotals, type InvoiceLineAmounts } from "./invoiceTotals";
import { isForeignVatNumber } from "./foreignVatNumber";

const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/;
// A year and a day: a whole year from any day, and every month or quarter
const maxRangeDays = 366;
const dayMs = 24 * 60 * 60 * 1000;

const parseDay = (value: unknown): Date | null => {
    const match = typeof value === "string" ? isoDate.exec(value) : null;

    if (!match) {
        return null;
    }

    const [, year, month, day] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    // 2026-02-30 rolls over to March: not a day
    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
};

const dayString = (date: Date) => date.toISOString().slice(0, 10);

export type ExportRange =
    { ok: true; from: string; to: string; before: string } | { ok: false; message: string };

/** from and to are days (YYYY-MM-DD), both included; `before` is the day after `to` */
export const parseExportRange = (from: unknown, to: unknown): ExportRange => {
    const first = parseDay(from);
    const last = parseDay(to);

    if (!first || !last || last < first) {
        return { ok: false, message: "invalidInput" };
    }

    if ((last.getTime() - first.getTime()) / dayMs >= maxRangeDays) {
        return { ok: false, message: "export.rangeTooLong" };
    }

    return {
        ok: true,
        from: dayString(first),
        to: dayString(last),
        before: dayString(new Date(last.getTime() + dayMs))
    };
};

export interface ExportInvoiceRow {
    id: number;
    number: string;
    invoiceDate: string;
    customerName: string | null;
    regNumber: string | null;
    vatNumber: string | null;
    paymentPeriod: number | null;
    vat: number | string | null;
    locked: number;
    sentDate: string | null;
}

const separator = ";";

/**
 * A spreadsheet runs a cell that starts with = + - @ (or a tab or carriage return) as a formula,
 * so a customer named "=HYPERLINK(...)" would run in the accountant's Excel. Such text gets a
 * leading apostrophe. Amounts are written by the app and never pass through here.
 */
const text = (value: string | number | null | undefined) => {
    const raw = value === null || value === undefined ? "" : String(value);
    const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;

    return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

// Decimal comma, as a spreadsheet set to Estonian expects next to the semicolon
const amount = (cents: number) => formatCents(cents).replace(".", ",");

const dueDate = (invoiceDate: string, days: number | null) => {
    const date = parseDay(invoiceDate.slice(0, 10));

    return date ? dayString(new Date(date.getTime() + Number(days ?? 0) * dayMs)) : "";
};

export const exportColumns = [
    "number",
    "date",
    "due",
    "customer",
    "regNumber",
    "vatNumber",
    "net",
    "vatRate",
    "vat",
    "total",
    "paid",
    "sent"
];

/**
 * One line per invoice, with the totals of its PDF: the same rounding (helpers/invoiceTotals.ts)
 * and no VAT for a foreign VAT number. A UTF-8 byte order mark first, so Excel reads õ, ä, ö, ü.
 */
export const invoicesCsv = (
    rows: ExportInvoiceRow[],
    lines: Map<number, InvoiceLineAmounts[]>,
    headings: Record<string, string>
) => {
    const header = exportColumns.map((column) => text(headings[column] ?? column));
    const body = rows.map((row) => {
        const noVat = isForeignVatNumber(row.vatNumber ?? undefined);
        const totals = invoiceTotals(lines.get(row.id), row.vat, noVat);

        return [
            text(row.number),
            text(row.invoiceDate.slice(0, 10)),
            text(dueDate(row.invoiceDate, row.paymentPeriod)),
            text(row.customerName),
            text(row.regNumber),
            text(row.vatNumber),
            amount(totals.net),
            text(noVat ? "0" : String(Number(row.vat ?? 0)).replace(".", ",")),
            amount(totals.vat),
            amount(totals.total),
            text(row.locked === 1 ? headings.yes : headings.no),
            text(row.sentDate ? row.sentDate.slice(0, 10) : "")
        ];
    });

    return `\uFEFF${[header, ...body].map((cells) => cells.join(separator)).join("\r\n")}\r\n`;
};
