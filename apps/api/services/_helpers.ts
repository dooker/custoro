import { sanitize, getEmailEnvContent, normalizeDate } from "../helper";
import path from "node:path";
import fs from "node:fs";
import nodemailer, { type TransportOptions } from "nodemailer";
import { query, queryErrorMessage } from "../helper/query";
import type { QueryIF, TotalRow } from "../types";
import type { InvoiceIF, InvoiceItemIF } from "../types/invoice";
import type { AllowedEmailKey, EmailConfigIF, EmailConfigResult, EmailIF } from "../types/email";
import { config } from "../config/config";
import type { ProductIF } from "../types/product";
import type { Request } from "express";
import type {
    GetConfigIF,
    GetGeneralMultipleIF,
    PostGeneralSingleIF,
    ReplaceVariablesIF
} from "../types/general";
import type { QueryResult } from "../types/query";
import { allowedEmailKeys } from "../variables";
import type { UserIF } from "../types/user";

export const adjustProduct = (resource: ProductIF) => {
    resource.price = Number(resource.price.toFixed(4));
    resource.discountPrice = Number(resource.discountPrice.toFixed(4));

    return resource;
};

export const toSnakeCase = <T extends object>(obj: T): T =>
    Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [
            key.replace(/([A-Z])/g, "_$1").toLowerCase(),
            value
        ])
    ) as T;

export const toCamelCase = <T extends object>(obj: T): T =>
    Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [
            key.replace(/_([a-z])/g, (_, char) => char.toUpperCase()),
            value
        ])
    ) as T;

export const getInvoice = async (request: Request): Promise<QueryResult<InvoiceIF>> => {
    const {
        database,
        params: { page, id: rawId }
    } = request;
    const pageId = Array.isArray(page) ? page[0] : page;
    const idId = Array.isArray(rawId) ? rawId[0] : rawId;
    const isHash = false;
    const id = idId || pageId;

    // Get invoice details
    const { success: invoiceSuccess, data: invoiceData } = await query<InvoiceIF>({
        database,
        sql: `SELECT *
              FROM invoices
              WHERE ${isHash ? "hash" : "id"} = ?;`,
        params: [id],
        logger: "Get single invoice"
    });

    if (!invoiceSuccess || !invoiceData) {
        return {
            success: false,
            message: "get.invoice"
        };
    }

    const invoice = toCamelCase(invoiceData[0]);

    // Get invoice items with product details
    const { success: itemsSuccess, data: items } = await query<InvoiceItemIF>({
        database,
        sql: `SELECT invoice_items.id,
                     invoice_items.quantity,
                     invoice_items.code,
                     invoice_items.name,
                     invoice_items.price,
                     invoice_items.discount_price as discountPrice,
                     invoice_items.unit,
                     invoice_items.comment
              FROM invoice_items
              WHERE invoice_id = ?;`,
        params: [isHash ? invoice.id : sanitize(id)],
        logger: "Get single invoice items"
    });

    if (!itemsSuccess) {
        return {
            success: false,
            message: "get.invoiceItems"
        };
    }

    const data = {
        ...toCamelCase<InvoiceIF>({
            ...invoice,
            createDate: normalizeDate(invoice.createDate),
            changeDate: normalizeDate(invoice.changeDate),
            invoiceDate: normalizeDate(invoice.invoiceDate)
        }),
        items
    };

    return {
        success: true,
        data: [data]
    };
};

export const sanitizeFilename = (filename: string) => {
    let sanitized = filename.replace(/ /g, "_");

    sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, "_");
    sanitized = sanitized.replace(/^_+|_+$/g, "");

    return sanitized;
};

export const deleteImageFile = (filename: string) => {
    if (!filename) {
        return;
    }

    const filePath = path.join(process.cwd(), "uploads", filename);

    fs.unlink(filePath, (error) => {
        if (error) {
            console.error(`Error deleting the file: ${error}`);
        }
    });
};

export const getGeneralMultiple = async ({
    request,
    sql,
    params,
    totalSql,
    type
}: GetGeneralMultipleIF) => {
    const {
        database,
        itemsPerPage,
        query: { page, limit }
    } = request;
    const requestedLimit = Number(limit ? parseInt(limit as string, 10) : itemsPerPage);
    const pageSize = Math.max(
        config.minItemsPerPage,
        Math.min(requestedLimit, config.maxItemsPerPage)
    );

    const { success, data: rows } = await query({
        database,
        sql,
        params,
        logger: `Get multiple ${type}`
    });
    const { success: totalSuccess, data: totalRows } = await query<TotalRow>({
        database,
        sql: totalSql,
        params,
        logger: `Get multiple ${type}`
    });
    const total = totalRows ? totalRows[0].total : 0;

    if (type === "products" && Array.isArray(rows)) {
        rows.forEach((element, index) => {
            rows[index] = adjustProduct(element as ProductIF);
        });
    }

    return {
        success: success && totalSuccess,
        resource: rows,
        meta: {
            total: Math.ceil(total / pageSize),
            page: parseInt(page as string) || 1
        }
    };
};

export const postGeneralSingle = async ({ sql, params, logger, database }: PostGeneralSingleIF) => {
    try {
        return await query({ database, sql, params, logger: `Add new ${logger}` }).then(
            (response) => {
                const { insertId, success } = response;

                if (insertId) {
                    return {
                        success,
                        insertId: insertId
                    };
                } else {
                    return response;
                }
            }
        );
    } catch (error) {
        // The details go to the log only; the client gets the generic key
        console.error(error);

        return {
            success: false,
            message: queryErrorMessage
        };
    }
};

export const isQueryError = <T>(response: QueryResult<T>) => {
    return Array.isArray(response) && response.length === 0;
};

export const putGeneralSingle = async ({ database, sql, params, logger: type }: QueryIF) => {
    try {
        const response = await query({ database, sql, params, logger: `Update single ${type}` });

        if (isQueryError(response)) {
            return {
                success: false,
                message: "General Error"
            };
        } else {
            return {
                success: true
            };
        }
    } catch (error) {
        // The details go to the log only; the client gets the generic key
        console.error(error);

        return {
            success: false,
            message: queryErrorMessage
        };
    }
};

export const getConfig = async ({
    database,
    fields,
    mapper
}: GetConfigIF): Promise<{
    success: boolean;
    data?: EmailConfigResult;
    message?: string;
}> => {
    const config: EmailConfigResult = {};

    let sql = `
        SELECT name, value, long_value AS longValue
        FROM config
    `;

    // params are hardcoded strings from initiator
    if (fields && fields.length) {
        const sqlFields = fields.map((name) => `'${name}'`).join(", ");
        sql += ` WHERE name IN (${sqlFields});`;
    }

    const { success, data } = await query<EmailConfigIF>({
        database,
        sql,
        logger: "Get settings for email"
    });

    if (!success) {
        return {
            success: false,
            message: "get.config"
        };
    }

    data?.forEach(({ name, value, longValue }, index) => {
        if (mapper && mapper.length) {
            name = mapper[index];
        }

        if (allowedEmailKeys.includes(name as AllowedEmailKey)) {
            config[name as AllowedEmailKey] = longValue || value;
        }
    });

    return {
        success: true,
        data: config
    };
};

export const replaceVariables = ({ content, replacements }: ReplaceVariablesIF) => {
    if (!content) {
        return "";
    }

    let result = content;

    for (const [key, value] of Object.entries(replacements)) {
        result = result.replaceAll(key, value);
    }

    return result;
};

export const email = async ({ email, config, attachments, replace }: EmailIF) => {
    const emailConfig = getEmailEnvContent();

    if (!emailConfig.password || !email || !config) {
        console.error("Missing some info to send email");

        return {
            success: false,
            message: "missingInfo"
        };
    }

    let { text, html } = config;

    if (replace) {
        text = replaceVariables({ content: String(text), replacements: replace });
        html = replaceVariables({ content: String(html), replacements: replace });
    }

    const transporter = nodemailer.createTransport({
        host: String(emailConfig.host),
        port: parseInt(String(emailConfig.port), 10) || 587,
        secure: false,
        auth: {
            user: String(emailConfig.username),
            pass: String(emailConfig.password)
        }
    } as TransportOptions);

    try {
        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: `${email}`,
            subject: `${config.subject}`,
            text: `${text}`,
            html: `${html}`,
            attachments
        };

        return await transporter
            .sendMail(mailOptions)
            .then(() => {
                return {
                    success: true
                };
            })
            .catch((error) => {
                console.log("Error while sending email:", error);

                return {
                    success: false,
                    message: "email.transporter"
                };
            });
    } catch (error) {
        console.error("Error sending email:", error);

        return {
            success: false,
            message: "email.forgot"
        };
    }
};

/**
 * Clears a user's avatar. `userId` overrides the id from the request (used by the profile
 * route so a user can only ever clear their own); the admin user route leaves it unset.
 */
export const deleteImage = async (request: Request, userId?: number | string) => {
    const {
        database,
        params: { id: paramId }
    } = request;
    // Express 5 leaves req.body undefined when a request has no body, as the web app's DELETE
    // requests do, so it must not be destructured
    const id = userId ?? request.body?.id ?? paramId;

    const { success: getAvatarSuccess, data } = await query<UserIF>({
        database,
        sql: `SELECT avatar
              FROM users
              WHERE id = ?;`,
        params: [String(id)],
        logger: "Get avatar filename"
    });
    const filename = data?.[0].avatar;

    if (!getAvatarSuccess) {
        return {
            success: false,
            message: "get.avatar"
        };
    }

    if (filename) {
        deleteImageFile(filename);
    }

    const { success: updateAvatarSuccess } = await query({
        database,
        sql: `UPDATE users
              SET avatar= ''
              WHERE id = ?;`,
        params: [String(id)],
        logger: "Set empty avatar"
    });

    if (!updateAvatarSuccess) {
        return {
            success: false,
            message: "put.avatar"
        };
    }

    return {
        success: true
    };
};
