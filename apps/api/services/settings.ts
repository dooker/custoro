import fs from "node:fs";
import * as dotenv from "dotenv";
import { query } from "../helper/query";
import { getEmailEnvContent } from "../helper";
import type { ConfigLogoIF, SettingsIF } from "../types/settings";
import type { QueryResult } from "../types/query";
import type { FrontRequestIF, UploadFileIF } from "../types/express";
import path from "path";
import { deleteImageFile } from "./_helpers";
import type { Request } from "express";

const password = "password";
const longFields = ["invoiceText", "invoiceHtml", "forgotText", "forgotHtml"];
const emailEnvFields = ["host", "port", "username", password];

const reloadEnv = (url: string) => {
    const envConfig = dotenv.parse(fs.readFileSync(url));

    for (const k in envConfig) {
        process.env[k] = envConfig[k];
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

    if (!fields) {
        const envConfig = getEmailEnvContent();

        for (const [key, value] of Object.entries(envConfig)) {
            if (key !== "password") {
                settings[key] = String(value);
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

    // const body = rawBody as SettingsBody;
    const emailEnvFileValues = getEmailEnvContent();
    const emailEnvFields = ["host", "port", "username", "password"] as const;
    type EmailEnvField = (typeof emailEnvFields)[number];
    const emailEnvFieldValues: Record<EmailEnvField, string> = {
        host: process.env.EMAIL_HOST || "",
        port: process.env.EMAIL_PORT || "587",
        username: process.env.EMAIL_USER || "",
        password: process.env.EMAIL_PASSWORD || ""
    };

    let filename;

    // memorize & remove email config IF set
    emailEnvFields.forEach((item) => {
        emailEnvFieldValues[item] = body[item];

        delete body[item];
    });

    // there is no length for this in email server data saving
    if (Object.keys(body).length) {
        const entries = Object.entries(body).filter(([key]: [string, string]) => key !== "logo");

        const shortEntries = entries.filter(([key]: [string, string]) => !longFields.includes(key));
        const longEntries = entries.filter(([key]: [string, string]) => longFields.includes(key));

        // Helpers: build placeholders only
        const buildCases = (pairs: [string, string][]) =>
            pairs.map(() => `WHEN name = ? THEN ?`).join(" ");
        const buildNames = (pairs: [string, string][]) => pairs.map(() => `?`).join(", ");

        // Short
        let shortCases = buildCases(shortEntries);
        let shortNames = buildNames(shortEntries);
        const shortCaseParams = shortEntries.flatMap(([key, value]) => [key, value]);
        const shortInParams = shortEntries.map(([key]: [string, string]) => key);

        // Long
        const longCases = buildCases(longEntries);
        const longNames = buildNames(longEntries);
        const longCaseParams = longEntries.flatMap(([key, value]) => [key, value]);
        const longInParams = longEntries.map(([key]: [string, string]) => key);

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

        // Execute short update
        if (shortEntries.length || file?.filename) {
            const sqlShort = `
                UPDATE config
                SET value = CASE ${shortCases} END
                WHERE name IN (${shortNames});
            `;
            const paramsShort = [...shortCaseParams, ...shortInParams];
            const { success } = await query({
                database,
                sql: sqlShort,
                params: paramsShort as string[],
                logger: "Update settings - short values"
            });

            if (!success) {
                return {
                    success: false,
                    message: "put.settings.short"
                };
            }
        }

        // Execute long update
        if (longEntries.length) {
            const sqlLong = `
                UPDATE config
                SET long_value = CASE ${longCases} END
                WHERE name IN (${longNames});
            `;
            const paramsLong = [...longCaseParams, ...longInParams];

            const { success } = await query({
                database,
                sql: sqlLong,
                params: paramsLong as string[],
                logger: "Update settings - long values"
            });

            if (!success) {
                return {
                    success: false,
                    message: "put.settings.long"
                };
            }
        }
    }

    const emailEnvFieldValuesSet = Object.values(emailEnvFieldValues).every((v) => v === undefined);

    if (!emailEnvFieldValuesSet) {
        // write email config to .env file
        const envData = `
    EMAIL_HOST=${emailEnvFieldValues.host || emailEnvFileValues.host}
    EMAIL_PORT=${emailEnvFieldValues.port || emailEnvFileValues.port}
    EMAIL_USER=${emailEnvFieldValues.username || emailEnvFileValues.username}
    EMAIL_PASS=${emailEnvFieldValues.password || emailEnvFileValues.password}`;
        const envEmailPath = path.resolve(process.cwd(), ".env.email");

        try {
            fs.writeFileSync(envEmailPath, envData.trim());
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
