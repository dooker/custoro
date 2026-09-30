import path from "path";
import { query } from "../helper/query";
import { email, getConfig } from "./_helpers";
import { EmailCustomerIF } from "../types/email";
import fs from "fs";
import type { Request } from "express";

export const postSingle = async (request: Request) => {
    const {
        database,
        body: { id },
        headers: { referer }
    } = request;
    const projectRoot = process.cwd();

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

    if (!customerSuccess || !customerData) {
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

    const attachments = {
        filename: filename,
        path: path.join(projectRoot, "uploads/pdf", filename)
    };

    if (!fs.existsSync(attachments.path)) {
        return {
            success: false,
            message: "missing.pdf"
        };
    }

    return await email({
        email: customer.invoiceEmail || customer.email,
        config,
        attachments: [attachments],
        replace: {
            "[INVOICE_LINK]": `${referer}pdf/${hash}`
        }
    });
};
