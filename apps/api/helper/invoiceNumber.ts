import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { addInvoiceLines, type InvoiceLineIF } from "./invoiceLines";
import { withTransaction } from "./transaction";

interface CreateInvoiceIF {
    database: string;
    customerId: number | null;
    vat: number | string;
    lines?: InvoiceLineIF[];
}

// Takes the next invoice number and creates the invoice with its lines in one transaction. The
// counter row is locked until the transaction ends, so invoices created at the same time get
// consecutive numbers instead of the same one, and a failure anywhere (a missing product, a
// worksheet that is already billed, a failed insert) rolls back the number, the invoice and the
// lines together, leaving no gap and no half-built invoice.
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

            const number = last + 1;

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

            return { id: insert.insertId, number };
        }
    );
