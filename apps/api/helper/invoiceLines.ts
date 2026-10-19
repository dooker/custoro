import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { TransactionRefusal } from "./transaction";

// A line of an invoice. It keeps its own copy of the product's code, name and prices, so an issued
// invoice does not change when the product does (or is deleted).
export interface InvoiceLineIF {
    worksheetId: number | null;
    productId: number;
    quantity: number;
    code: string;
    name: string;
    price: number;
    discountPrice: number;
    unit: string;
    comment: string;
}

/**
 * Adds lines to an invoice and marks the worksheets behind them as billed on it, on the caller's
 * connection (so it is part of the caller's transaction). A worksheet can be billed once: if one
 * of them is already on an invoice the whole transaction is refused with "worksheet.invoiced".
 */
export const addInvoiceLines = async (
    connection: PoolConnection,
    invoiceId: number,
    lines: InvoiceLineIF[]
) => {
    if (!lines.length) {
        return;
    }

    await connection.query(
        `INSERT INTO invoice_items (worksheet_id, product_id, invoice_id, quantity, code, name, price,
                                    discount_price, unit, comment)
         VALUES ?;`,
        [
            lines.map((line) => [
                line.worksheetId,
                line.productId,
                invoiceId,
                line.quantity,
                line.code,
                line.name,
                line.price,
                line.discountPrice,
                line.unit,
                line.comment
            ])
        ]
    );

    const worksheetIds = [
        ...new Set(lines.map((line) => line.worksheetId).filter((id): id is number => !!id))
    ];

    if (!worksheetIds.length) {
        return;
    }

    const [billed] = await connection.query<ResultSetHeader>(
        `UPDATE worksheets
         SET invoice = ?
         WHERE id IN (?)
           AND invoice IS NULL;`,
        [invoiceId, worksheetIds]
    );

    if (billed.affectedRows !== worksheetIds.length) {
        throw new TransactionRefusal("worksheet.invoiced");
    }
};
