import { query } from "../helper/query";
import { email, getConfig } from "./_helpers";
import { EmailCustomerIF } from "../types/email";
import fs from "fs";
import { tenantOf } from "../helpers/tenant";
import type { Request } from "express";
import { pdfDir } from "../config/paths";
import { pdfCandidates } from "../helpers/pdfFiles";
import { getAppOrigin } from "../helpers/appOrigin";

export const postSingle = async (request: Request) => {
    const {
        database,
        body: { id }
    } = request;
    const tenantId = tenantOf(request);

    const { success: customerSuccess, data: customerData } = await query<EmailCustomerIF>({
        database,
        sql: `SELECT customers.name, customers.email as email, customers.invoice_email as invoiceEmail, invoices.filename, invoices.hash
              FROM customers
                       INNER JOIN invoices
                                  ON invoices.tenant_id = customers.tenant_id
                                      AND invoices.customer_id = customers.id
              WHERE invoices.tenant_id = ?
                AND invoices.id = ?;`,
        params: [tenantId, id],
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
        tenantId,
        fields: ["invoiceSubject", "invoiceText", "invoiceHtml"],
        mapper: ["subject", "text", "html"]
    });

    if (!configSuccess) {
        return {
            success: false,
            message
        };
    }

    // The file name comes from the database; only a file directly inside the company's folder
    // (or, for company 1, the folder from before companies) is attached
    const pdfPath = pdfCandidates(pdfDir, tenantId, filename).find((candidate) =>
        fs.existsSync(candidate)
    );
    const attachments = {
        filename: filename,
        path: pdfPath ?? ""
    };

    if (!pdfPath) {
        return {
            success: false,
            message: "missing.pdf"
        };
    }

    const sent = await email({
        database,
        tenantId,
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
              WHERE tenant_id = ?
                AND id = ?;`,
        params: [tenantId, Number(id)],
        logger: "Record invoice sent date"
    });

    return { success: true, sentDate: recorded.success ? new Date().toISOString() : null };
};
