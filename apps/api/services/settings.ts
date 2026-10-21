import fs from "node:fs";
import * as dotenv from "dotenv";
import { query } from "../helper/query";
import { getEmailEnvContent } from "../helper";
import type { ConfigLogoIF, SettingsIF } from "../types/settings";
import type { QueryResult } from "../types/query";
import type { FrontRequestIF, UploadFileIF } from "../types/express";
import path from "path";
import { deleteImageFile } from "./_helpers";
import { isAdmin } from "../helpers/authorize";
import { highestNumberSql } from "../helper/invoiceNumber";
import { TransactionRefusal, withTransaction } from "../helper/transaction";
import { emailEnvKeys, formatEmailEnv } from "../helpers/emailEnv";
import {
    isBelowUsedNumber,
    lastInvoiceIdTooLowMessage,
    longFields,
    mailFields,
    parseSettingsInput,
    type MailField
} from "../helpers/settingsInput";
import type { RowDataPacket } from "mysql2/promise";
import type { Request } from "express";

const emailEnvFields: string[] = [...mailFields];

// Only the mail settings are taken from the file into the environment, whatever else it holds
const reloadEnv = (url: string) => {
    const envConfig = dotenv.parse(fs.readFileSync(url));

    for (const key of Object.values(emailEnvKeys)) {
        if (key in envConfig) {
            process.env[key] = envConfig[key];
        }
    }
};

const getLogoFilename = async (database: string) => {
    const { success, data } = await query<ConfigLogoIF>({
        database,
        sql: `SELECT value
              FROM config
              WHERE name = 'logo';`,
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
        FROM config ${placeholders ? `WHERE name IN (${placeholders})` : ""};
    `;
    const params = fields ? fields.split(",").map((item) => item) : [];

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

        if (!emailEnvFields.includes(key)) {
            acc[key] = longFields.includes(key) ? row.long_value : row.value;
        }

        return acc;
    }, {} as SettingsIF);

    // Mail server settings are only shown to, and editable by, admins
    if (!fields && isAdmin(request)) {
        const envConfig = getEmailEnvContent();

        for (const [key, value] of Object.entries(envConfig)) {
            if (key !== "password") {
                // An unset mail setting is empty, not the text "undefined" the form would send back
                settings[key] = value === undefined ? "" : String(value);
            }
        }
    }

    return {
        success: true,
        data: [settings]
    };
};

export const putAll = async (request: Request) => {
    const { body, file: rawFile, database } = request as FrontRequestIF;
    const file = rawFile as UploadFileIF;

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
    const emailEnvFileValues = getEmailEnvContent();
    const emailEnvFieldValues: Record<MailField, string | undefined> = {
        host: mail.host,
        port: mail.port,
        username: mail.username,
        password: mail.password
    };
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
            shortNames += `, ?`;
            shortCaseParams.push("logo", file.filename);
            shortInParams.push("logo");
            filename = file.filename;
        } else {
            const { success, data, message } = await getLogoFilename(database);

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
                WHERE name IN (${shortNames});
            `,
                params: [...shortCaseParams, ...shortInParams],
                logger: "Update settings - short values",
                message: "put.settings.short"
            });
        }

        if (longEntries.length) {
            updates.push({
                sql: `
                UPDATE config
                SET long_value = CASE ${longCases} END
                WHERE name IN (${longNames});
            `,
                params: [...longCaseParams, ...longInParams],
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
                         WHERE name = 'lastInvoiceId'
                         FOR UPDATE;`
                    );

                    // Read after the lock, so it counts every invoice committed before it
                    const [highestRows] = await connection.query<RowDataPacket[]>(highestNumberSql);
                    const highest = String(highestRows[0]?.highest);

                    if (!/^\d+$/.test(highest)) {
                        throw new Error(
                            `The highest invoice number is not a whole number: ${highest}`
                        );
                    }

                    if (isBelowUsedNumber(lastInvoiceId, highest)) {
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

    const emailEnvFieldValuesSet = Object.values(emailEnvFieldValues).every((v) => v === undefined);

    if (!emailEnvFieldValuesSet) {
        // write email config to .env file
        const envData = formatEmailEnv(emailEnvFieldValues, emailEnvFileValues);
        const envEmailPath = path.resolve(process.cwd(), ".env.email");

        try {
            fs.writeFileSync(envEmailPath, envData);
            reloadEnv(envEmailPath);
        } catch (error) {
            if (error instanceof Error) {
                console.error("Failed to write .env.email file:", error.message);
            } else {
                console.error("Failed to write .env.email file:", error);
            }
        }
    }

    return {
        success: true,
        ...(filename ? { resource: filename } : {})
    };
};

export const deleteLogo = async (request: Request) => {
    const { database } = request;

    const { success: getFilenameSuccess, data, message } = await getLogoFilename(database);
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
              WHERE name = ?`,
        params: ["logo"],
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
