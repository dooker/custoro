import * as Sentry from "@sentry/node";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "../db";

interface CreateInvoiceIF {
    database: string;
    customerId: number;
    vat: number;
}

// Takes the next invoice number and inserts the invoice in one transaction. The counter row is
// locked until the transaction ends, so invoices created at the same time get consecutive numbers
// instead of the same one, and a failed insert rolls the counter back without leaving a gap.
// invoices.number also has a unique index as a last line of defence.
export const createInvoiceWithNextNumber = async ({
    database,
    customerId,
    vat
}: CreateInvoiceIF): Promise<{ id: number; number: number } | null> => {
    const connection = await getPool(database).getConnection();

    try {
        await connection.beginTransaction();

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

        await connection.commit();

        return { id: insert.insertId, number };
    } catch (error) {
        await connection.rollback().catch(() => {});
        console.error("Creating an invoice with the next number failed:", error);
        Sentry.captureException(error);

        return null;
    } finally {
        connection.release();
    }
};
