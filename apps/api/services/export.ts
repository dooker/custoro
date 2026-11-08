import type { Request } from "express";
import { query } from "../helper/query";
import {
    exportColumns,
    invoicesCsv,
    parseExportRange,
    type ExportInvoiceRow
} from "../helpers/invoiceExport";
import type { InvoiceLineAmounts } from "../helpers/invoiceTotals";
import { pdfTranslator } from "./pdf";

// Invoices only, never offers. The customer as billed for a paid invoice (the copy taken when it
// was marked as paid), the customer as it is now for an open one: what its PDF prints.
const invoicesSql = `
    SELECT invoices.id,
           invoices.number,
           invoices.invoice_date AS invoiceDate,
           COALESCE(invoices.customer_name, customers.name) AS customerName,
           COALESCE(invoices.customer_reg_number, customers.reg_number) AS regNumber,
           COALESCE(invoices.customer_vat_number, customers.vat_number) AS vatNumber,
           COALESCE(invoices.customer_payment_period, customers.payment_period) AS paymentPeriod,
           invoices.vat,
           invoices.locked,
           invoices.sent_date AS sentDate
    FROM invoices
             LEFT JOIN customers ON customers.id = invoices.customer_id
    WHERE invoices.invoice_type = 'invoice'
      AND invoices.invoice_date >= ?
      AND invoices.invoice_date < ?
    ORDER BY invoices.invoice_date, invoices.number_sort, invoices.id`;

const linesSql = `
    SELECT invoice_items.invoice_id AS invoiceId,
           invoice_items.price,
           invoice_items.quantity
    FROM invoice_items
             INNER JOIN invoices ON invoices.id = invoice_items.invoice_id
    WHERE invoices.invoice_type = 'invoice'
      AND invoices.invoice_date >= ?
      AND invoices.invoice_date < ?`;

/** GET /export/invoices?from=YYYY-MM-DD&to=YYYY-MM-DD&language=et */
export const getInvoicesCsv = async (request: Request) => {
    const { database, query: search } = request;
    const range = parseExportRange(search.from, search.to);

    if (!range.ok) {
        return { success: false as const, message: range.message };
    }

    const params = [range.from, range.before];
    const invoices = await query<ExportInvoiceRow>({
        database,
        sql: invoicesSql,
        params,
        logger: "Export invoices"
    });
    const items = await query<InvoiceLineAmounts & { invoiceId: number }>({
        database,
        sql: linesSql,
        params,
        logger: "Export invoice lines"
    });

    if (!invoices.success || !items.success) {
        return { success: false as const, message: "error" };
    }

    const lines = new Map<number, InvoiceLineAmounts[]>();

    for (const { invoiceId, price, quantity } of items.data ?? []) {
        lines.set(invoiceId, [...(lines.get(invoiceId) ?? []), { price, quantity }]);
    }

    const t = await pdfTranslator(search.language);
    const headings = Object.fromEntries(
        [...exportColumns, "yes", "no"].map((key) => [key, t(`export.${key}`)])
    );

    return {
        success: true as const,
        filename: `invoices_${range.from}_${range.to}.csv`,
        csv: invoicesCsv(invoices.data ?? [], lines, headings)
    };
};
