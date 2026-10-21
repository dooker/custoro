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

// The highest number that is on an invoice. number_sort is the number as a number and has an
// index, so MAX reads one row of it - but it is 0 for a number of more than 18 digits, which does
// not fit its BIGINT. Those (up to the 25 digits of invoices.number) are among the rows whose
// number_sort is 0, found through the same index and ordered by value: the rows with 0 are few
// (numbers that are not plain digits, such as INV-001), so this stays cheap.
export const highestNumberSql = `SELECT CAST(COALESCE(MAX(number_sort), 0) AS CHAR) AS highest,
                                        (SELECT number
                                         FROM invoices
                                         WHERE number_sort = 0
                                           AND number REGEXP '^[0-9]{19,${config.maxInvoiceNumberDigits}}$'
                                         ORDER BY CAST(number AS DECIMAL(${config.maxInvoiceNumberDigits}, 0)) DESC
                                         LIMIT 1) AS highestLong
                                 FROM invoices`;

// The highest number on an invoice (0 when there are none), as a number that cannot be rounded.
// Called on a connection that holds the counter row's lock, so it counts every invoice committed
// before the lock.
export const getHighestNumber = async (connection: PoolConnection) => {
    const [rows] = await connection.query<RowDataPacket[]>(highestNumberSql);
    const highest = String(rows[0]?.highest);
    const highestLong = rows[0]?.highestLong;

    if (!/^\d+$/.test(highest)) {
        throw new Error(`The highest invoice number is not a whole number: ${highest}`);
    }

    if (highestLong === null || highestLong === undefined) {
        return BigInt(highest);
    }

    if (!/^\d+$/.test(String(highestLong))) {
        throw new Error(`The highest long invoice number is not a whole number: ${highestLong}`);
    }

    // A number of more than 18 digits is above any number number_sort holds
    return BigInt(String(highestLong));
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
            const used = last > highest ? last : highest;
            const number = used + 1n;

            // The number has to fit invoices.number (and the counter in Settings)
            if (String(number).length > config.maxInvoiceNumberDigits) {
                throw new Error(
                    `The next invoice number would have more than ${config.maxInvoiceNumberDigits} digits: ${number}`
                );
            }

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
