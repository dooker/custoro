import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { addInvoiceLines, type InvoiceLineIF } from "./invoiceLines";
import { withTransaction } from "./transaction";

interface CreateInvoiceIF {
    database: string;
    customerId: number | null;
    vat: number | string;
    lines?: InvoiceLineIF[];
}

// The highest number that is on an invoice, as text (0 when there are no invoices). number_sort is
// the number as a number and has an index, so this reads one row of it.
export const highestNumberSql = `SELECT CAST(COALESCE(MAX(number_sort), 0) AS CHAR) AS highest
                                 FROM invoices`;

// Takes the next invoice number and creates the invoice with its lines in one transaction. The
// counter row is locked until the transaction ends, so invoices created at the same time get
// consecutive numbers instead of the same one, and a failure anywhere (a missing product, a
// worksheet that is already billed, a failed insert) rolls back the number, the invoice and the
// lines together, leaving no gap and no half-built invoice.
// The counter is a setting, so it can be set below numbers that are already used (and a stale
// Settings page can write an old value back): the next number is one more than the larger of the
// counter and the highest number on an invoice, instead of a number that is already taken.
// invoices.number also has a unique index as a last line of defence.
export const createInvoiceWithNextNumber = ({
    database,
    customerId,
    vat,
    lines = []
}: CreateInvoiceIF) =>
    withTransaction(
        database,
        "Creating an invoice with the next number",
        "post.newInvoice",
        async (connection) => {
            const [rows] = await connection.query<RowDataPacket[]>(
                `SELECT value
                 FROM config
                 WHERE name = 'lastInvoiceId'
                 FOR UPDATE;`
            );
            const last = Number(rows[0]?.value);

            if (!rows.length || !Number.isInteger(last)) {
                throw new Error(
                    `config.lastInvoiceId is missing or not a whole number: ${rows[0]?.value}`
                );
            }

            // Read after the counter row is locked, so an invoice the previous request just
            // created is counted
            const [highestRows] = await connection.query<RowDataPacket[]>(highestNumberSql);
            const highest = String(highestRows[0]?.highest);

            if (!/^\d+$/.test(highest)) {
                throw new Error(`The highest invoice number is not a whole number: ${highest}`);
            }

            const used = BigInt(last) > BigInt(highest) ? BigInt(last) : BigInt(highest);
            const number = used + 1n;

            const [insert] = await connection.query<ResultSetHeader>(
                `INSERT INTO invoices
                 SET number       = ?,
                     customer_id  = ?,
                     create_date  = NOW(),
                     change_date  = NOW(),
                     invoice_date = NOW(),
                     vat          = ?;`,
                [String(number), customerId, vat]
            );

            await connection.query(
                `UPDATE config
                 SET value = ?
                 WHERE name = 'lastInvoiceId';`,
                [String(number)]
            );

            await addInvoiceLines(connection, insert.insertId, lines);

            return { id: insert.insertId, number: Number(number) };
        }
    );
