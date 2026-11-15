import { query } from "../helper/query";
import type { ConfigLogoIF, SettingsIF } from "../types/settings";
import type { QueryResult } from "../types/query";
import type { FrontRequestIF, UploadFileIF } from "../types/express";
import { deleteImageFile } from "./_helpers";
import { isAdmin } from "../helpers/authorize";
import { getHighestNumber } from "../helper/invoiceNumber";
import { TransactionRefusal, withTransaction } from "../helper/transaction";
import { companyMailRows, readCompanyMail, saveCompanyMail } from "./companyMail";
import {
    isBelowUsedNumber,
    lastInvoiceIdTooLowMessage,
    longFields,
    mailFields,
    parseSettingsInput
} from "../helpers/settingsInput";
import { tenantOf } from "../helpers/tenant";
import type { Request } from "express";

// Never in a settings answer, whoever asks: the company's mail server rows (the password among
// them, encrypted) and the old names of the mail fields
const hiddenSettings: string[] = [...Object.values(companyMailRows), ...mailFields];

const getLogoFilename = async (database: string, tenantId: number) => {
    const { success, data } = await query<ConfigLogoIF>({
        database,
        sql: `SELECT value
              FROM config
              WHERE tenant_id = ?
                AND name = 'logo';`,
        params: [tenantId],
        logger: "Get logo filename"
    });

    return {
        success: success,
        ...(success ? { data: data?.[0] } : {}),
        ...(!success ? { message: "get.logo" } : {})
    };
};

export const getAll = async (request: Request): Promise<QueryResult<SettingsIF>> => {
    const {
        database,
        query: { fields: rawFields }
    } = request;
    const fields: string | undefined = typeof rawFields === "string" ? rawFields : undefined;

    const placeholders = fields
        ? fields
              .split(",")
              .map(() => "?")
              .join(",")
        : null;
    const sql = `
        SELECT *
        FROM config
        WHERE tenant_id = ? ${placeholders ? `AND name IN (${placeholders})` : ""};
    `;
    const params = [tenantOf(request), ...(fields ? fields.split(",").map((item) => item) : [])];

    const { success, data: rows } = await query<SettingsIF>({
        database,
        sql,
        params,
        logger: "Get settings"
    });

    if (!success || !rows) {
        return {
            success: false,
            message: "get.settings"
        };
    }

    const settings = rows.reduce<SettingsIF>((acc, row) => {
        const key = String(row.name);

        if (!hiddenSettings.includes(key)) {
            acc[key] = longFields.includes(key) ? row.long_value : row.value;
        }

        return acc;
    }, {} as SettingsIF);

    // The company's own mail server is only shown to, and editable by, its admins: never the
    // password (only whether one is saved), and never the install's default server
    if (!fields && isAdmin(request)) {
        const mail = await readCompanyMail(database, tenantOf(request));

        if (!mail) {
            return {
                success: false,
                message: "get.settings"
            };
        }

        for (const key of ["host", "port", "username", "from"] as const) {
            // An unset mail setting is empty, not the text "undefined" the form would send back
            settings[key] = mail[key] ?? "";
        }

        settings.mailPasswordSaved = mail.password ? "1" : "";
        settings.mailUsesDefault = mail.host ? "" : "1";
    }

    return {
        success: true,
        data: [settings]
    };
};

export const putAll = async (request: Request) => {
    const { body, file: rawFile, database } = request as FrontRequestIF;
    const file = rawFile as UploadFileIF;
    const tenantId = tenantOf(request);

    // Only the setting keys the app knows are accepted, and a few of them only in a valid format
    const parsed = parseSettingsInput(body);

    if (!parsed.success) {
        // The upload is already on disk and nothing will refer to it
        if (file?.filename) {
            deleteImageFile(file.filename);
        }

        return {
            success: false,
            message: parsed.message
        };
    }

    const { short: shortEntries, long: longEntries, mail } = parsed.input;
    const lastInvoiceId = shortEntries.find(([key]) => key === "lastInvoiceId")?.[1];
    // The upload of a request that is refused is already on disk and nothing will refer to it
    const discardUpload = () => {
        if (file?.filename) {
            deleteImageFile(file.filename);
        }
    };

    let filename;

    if (shortEntries.length || longEntries.length || file?.filename) {
        // Helpers: build placeholders only
        const buildCases = (pairs: [string, string][]) =>
            pairs.map(() => `WHEN name = ? THEN ?`).join(" ");
        const buildNames = (pairs: [string, string][]) => pairs.map(() => `?`).join(", ");

        // Short
        let shortCases = buildCases(shortEntries);
        let shortNames = buildNames(shortEntries);
        const shortCaseParams = shortEntries.flatMap(([key, value]) => [key, value]);
        const shortInParams = shortEntries.map(([key]) => key);

        // Long
        const longCases = buildCases(longEntries);
        const longNames = buildNames(longEntries);
        const longCaseParams = longEntries.flatMap(([key, value]) => [key, value]);
        const longInParams = longEntries.map(([key]) => key);

        // Logo
        if (file?.filename) {
            shortCases += ` WHEN name = ? THEN ?`;
            // The list is empty when the logo is the only thing that was sent: "IN (, ?)" is not SQL
            shortNames += shortNames ? `, ?` : `?`;
            shortCaseParams.push("logo", file.filename);
            shortInParams.push("logo");
            filename = file.filename;
        } else {
            const { success, data, message } = await getLogoFilename(database, tenantId);

            if (!success) {
                return {
                    success,
                    message
                };
            }

            filename = data?.value;
        }

        // The statements, in the order they run
        const updates: { sql: string; params: string[]; logger: string; message: string }[] = [];

        if (shortEntries.length || file?.filename) {
            updates.push({
                sql: `
                UPDATE config
                SET value = CASE ${shortCases} END
                WHERE tenant_id = ?
                  AND name IN (${shortNames});
            `,
                params: [...shortCaseParams, String(tenantId), ...shortInParams],
                logger: "Update settings - short values",
                message: "put.settings.short"
            });
        }

        if (longEntries.length) {
            updates.push({
                sql: `
                UPDATE config
                SET long_value = CASE ${longCases} END
                WHERE tenant_id = ?
                  AND name IN (${longNames});
            `,
                params: [...longCaseParams, String(tenantId), ...longInParams],
                logger: "Update settings - long values",
                message: "put.settings.long"
            });
        }

        if (lastInvoiceId !== undefined) {
            // The counter cannot go below a number that an invoice already has, which includes a
            // stale Settings page: it sends the counter it loaded along with any other setting it
            // saves. The check and the writes are one transaction that locks the counter row
            // first, as creating an invoice does. An invoice being created then either committed
            // before the lock (and is counted below) or waits until the settings are saved, so
            // the counter is never left lower than a number that was handed out in between.
            const saved = await withTransaction(
                database,
                "Update settings with the invoice counter",
                "put.settings.short",
                async (connection) => {
                    await connection.query(
                        `SELECT value
                         FROM config
                         WHERE tenant_id = ?
                           AND name = 'lastInvoiceId'
                         FOR UPDATE;`,
                        [tenantId]
                    );

                    // Read after the lock, so it counts every invoice committed before it
                    if (
                        isBelowUsedNumber(
                            lastInvoiceId,
                            await getHighestNumber(connection, tenantId)
                        )
                    ) {
                        throw new TransactionRefusal(lastInvoiceIdTooLowMessage);
                    }

                    for (const { sql, params } of updates) {
                        await connection.query(sql, params);
                    }
                }
            );

            if (!saved.ok) {
                discardUpload();

                return {
                    success: false,
                    message: saved.message
                };
            }
        } else {
            for (const [index, { sql, params, logger, message }] of updates.entries()) {
                const { success } = await query({ database, sql, params, logger });

                if (!success) {
                    // Nothing was saved yet when the first statement fails
                    if (index === 0) {
                        discardUpload();
                    }

                    return {
                        success: false,
                        message
                    };
                }
            }
        }
    }

    // The company's mail server: an empty password keeps the saved one, a typed one is stored
    // encrypted and refused without MAIL_SETTINGS_KEY
    if (Object.values(mail).some((value) => value !== undefined)) {
        const saved = await saveCompanyMail(database, tenantId, mail);

        if (!saved.ok) {
            return {
                success: false,
                message: saved.message
            };
        }
    }

    return {
        success: true,
        ...(filename ? { resource: filename } : {})
    };
};

export const deleteLogo = async (request: Request) => {
    const { database } = request;
    const tenantId = tenantOf(request);

    const {
        success: getFilenameSuccess,
        data,
        message
    } = await getLogoFilename(database, tenantId);
    const filename = data?.value;

    if (!getFilenameSuccess) {
        return {
            success: false,
            message
        };
    }

    const { success: updateFilenameSuccess } = await query({
        database,
        sql: `UPDATE config
              SET value=''
              WHERE tenant_id = ?
                AND name = ?`,
        params: [tenantId, "logo"],
        logger: "Reset logo value"
    });

    if (!updateFilenameSuccess) {
        return {
            success: false,
            message: "put.logo"
        };
    }

    if (filename) {
        deleteImageFile(filename);
    }

    const isSuccess = getFilenameSuccess && updateFilenameSuccess;

    return {
        success: isSuccess,
        ...(!isSuccess ? { message: "delete.logo" } : {})
    };
};
