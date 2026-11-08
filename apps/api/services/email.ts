import { query } from "../helper/query";
import { email, getConfig } from "./_helpers";
import { EmailCustomerIF } from "../types/email";
import fs from "fs";
import type { Request } from "express";
import { pdfDir } from "../config/paths";
import { resolveInside } from "../helpers/pdfFiles";
import { getAppOrigin } from "../helpers/appOrigin";

export const postSingle = async (request: Request) => {
    const {
        database,
        body: { id }
    } = request;

    const { success: customerSuccess, data: customerData } = await query<EmailCustomerIF>({
        database,
        sql: `SELECT customers.name, customers.email as email, customers.invoice_email as invoiceEmail, invoices.filename, invoices.hash
              FROM customers
                       INNER JOIN invoices
                                  ON invoices.customer_id = customers.id
              WHERE invoices.id = ?;`,
        params: [id],
        logger: "Get user details for email"
    });

    // An invoice without a customer has nobody to send it to (before: a 500 on customerData[0])
    if (!customerSuccess || !customerData?.[0]) {
        return {
            success: false,
            message: "get.customer"
        };
    }

    const customer = customerData[0];
    const { filename, hash } = customer;
    delete customer.filename;

    if (!filename || !hash) {
        return {
            success: false,
            message: "missing.data"
        };
    }

    const {
        success: configSuccess,
        data: config,
        message
    } = await getConfig({
        database,
        fields: ["invoiceSubject", "invoiceText", "invoiceHtml"],
        mapper: ["subject", "text", "html"]
    });

    if (!configSuccess) {
        return {
            success: false,
            message
        };
    }

    // The file name comes from the database; only a file directly inside pdfDir is attached
    const pdfPath = resolveInside(pdfDir, filename);
    const attachments = {
        filename: filename,
        path: pdfPath ?? ""
    };

    if (!pdfPath || !fs.existsSync(pdfPath)) {
        return {
            success: false,
            message: "missing.pdf"
        };
    }

    const sent = await email({
        email: customer.invoiceEmail || customer.email,
        config,
        attachments: [attachments],
        replace: {
            // Built from the configured app origin, never from the Referer header, which is the
            // sender's to choose (and in production the full page URL, not the site root)
            "[INVOICE_LINK]": `${getAppOrigin()}/pdf/${hash}`
        }
    });

    if (!sent.success) {
        return sent;
    }

    // When it was last emailed, shown on the invoice. The email is already gone, so a failure
    // here is logged by query() and not reported as a failed send
    const recorded = await query({
        database,
        sql: `UPDATE invoices
              SET sent_date = NOW()
              WHERE id = ?;`,
        params: [Number(id)],
        logger: "Record invoice sent date"
    });

    return { success: true, sentDate: recorded.success ? new Date().toISOString() : null };
};
