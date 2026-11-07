import fs from "node:fs";
import { legacyEmailEnvFile, mailSettingsFile } from "./config/paths";
import {
    parseLegacyEmailEnv,
    parseMailSettings,
    resolveMailSettings,
    type MailValues
} from "./helpers/mailSettings";

export const tagsToReplace: Record<"&" | "<" | ">", string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;"
};

export const replaceTag = (tag: string) => {
    return tagsToReplace[tag as keyof typeof tagsToReplace] || tag;
};

export const safeTagsReplace = (string: string) => {
    return string.replace(/[&<>]/g, replaceTag);
};

export const sanitize = (input: string | number) => {
    if (!input) {
        return "";
    }

    if (typeof input === "number") {
        return input;
    }

    input = input.replace(/'/g, "\\'").replace(/"/g, '\\"');

    return String(safeTagsReplace(input.toString()));
};

export const getTotal = (itemsPerPage: number, total: number) => {
    return Math.ceil(total / itemsPerPage);
};

export const formatDateTime = (date: string | Date) => {
    return new Date(date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "numeric",
        year: "numeric"
    });
};

const readFileIfExists = (file: string) => {
    try {
        return fs.readFileSync(file, "utf8");
    } catch (error) {
        if ((error as { code?: string }).code === "ENOENT") return null;

        throw error;
    }
};

/** The mail settings saved on the admin page, from their file or, until it exists, .env.email. */
export const readSavedMailSettings = (): MailValues => {
    const saved = readFileIfExists(mailSettingsFile);

    if (saved !== null) return parseMailSettings(saved);

    const legacy = readFileIfExists(legacyEmailEnvFile);

    return legacy === null ? {} : parseLegacyEmailEnv(legacy);
};

/** What mail is sent with: each saved setting, else the EMAIL_ variable of the environment. */
export const getMailSettings = () => resolveMailSettings(readSavedMailSettings(), process.env);

export const normalizeDate = (isoString: string | Date) => {
    const date = new Date(isoString);

    return date.toISOString().slice(0, 10);
};
