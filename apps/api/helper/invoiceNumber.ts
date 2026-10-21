import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { config } from "../config/config";
import { addInvoiceLines, type InvoiceLineIF } from "./invoiceLines";
import { withTransaction } from "./transaction";

interface CreateInvoiceIF {
    database: string;
    customerId: number | null;
    vat: number | string;
    lines?: InvoiceLineIF[];
}

// MySQL's error code for a number the unique key on invoices.number already has
const duplicateEntry = "ER_DUP_ENTRY";

// How many numbers in a row are skipped for being taken before the invoice is refused
const maxSkippedNumbers = 20;

// The highest number that is on an invoice, as text (0 when there are no invoices). number_sort is
// the number as a number and has an index, so this reads one row of it. A number the app hands out
// always has one (see config.maxInvoiceNumberDigits); numbers that are not plain digits, or that
// are longer, have 0 there and are not counted: they can never be the same as a number handed out.
export const highestNumberSql = `SELECT CAST(COALESCE(MAX(number_sort), 0) AS CHAR) AS highest
                                 FROM invoices`;

// The highest number on an invoice (0 when there are none), as a number that cannot be rounded.
// Called on a connection that holds the counter row's lock, so it counts every invoice committed
// before the lock.
export const getHighestNumber = async (connection: PoolConnection) => {
    const [rows] = await connection.query<RowDataPacket[]>(highestNumberSql);
    const highest = String(rows[0]?.highest);

    if (!/^\d+$/.test(highest)) {
        throw new Error(`The highest invoice number is not a whole number: ${highest}`);
    }

    return BigInt(highest);
};

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
            // The counter is read as the text it is, not through Number(), which rounds a number
            // of more than 15 digits to one that another invoice may already have
            const lastText = String(rows[0]?.value).trim();

            if (!rows.length || !/^\d+$/.test(lastText)) {
                throw new Error(
                    `config.lastInvoiceId is missing or not a whole number: ${rows[0]?.value}`
                );
            }

            // Read after the counter row is locked, so an invoice the previous request just
            // created is counted
            const highest = await getHighestNumber(connection);
            const last = BigInt(lastText);
            let number = (last > highest ? last : highest) + 1n;
            let insert: ResultSetHeader | undefined;

            for (let skipped = 0; insert === undefined; skipped++) {
                // Past the digits number_sort holds, the highest number could no longer be found
                if (String(number).length > config.maxInvoiceNumberDigits) {
                    throw new Error(
                        `The next invoice number would have more than ${config.maxInvoiceNumberDigits} digits: ${number}`
                    );
                }

                try {
                    [insert] = await connection.query<ResultSetHeader>(
                        `INSERT INTO invoices
                         SET number       = ?,
                             customer_id  = ?,
                             create_date  = NOW(),
                             change_date  = NOW(),
                             invoice_date = NOW(),
                             vat          = ?;`,
                        [String(number), customerId, vat]
                    );
                } catch (error) {
                    // The unique key compares numbers by the column's collation, which can call a
                    // number typed in by hand the same as the next one without it being the same
                    // text ("42 " with a space, or 42 in the digits of another script). number_sort
                    // is 0 for those, so the highest number does not show them. The number is
                    // skipped, a few at most, and the counter moves on with it. The failed insert
                    // only undoes itself, the transaction goes on.
                    if (
                        (error as { code?: string }).code !== duplicateEntry ||
                        skipped >= maxSkippedNumbers
                    ) {
                        throw error;
                    }

                    number += 1n;
                }
            }

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
