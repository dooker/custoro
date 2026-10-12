import dotenv from "dotenv";
import type { DBConfigIF, DBConfigMap } from "./types";
import path from "path";

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

export const getEmailEnvContent = () => {
    const envPath = path.join(process.cwd(), ".env.email");
    dotenv.config({ path: envPath, quiet: true });

    return {
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        username: process.env.EMAIL_USER,
        password: process.env.EMAIL_PASS
    };
};

export const normalizeDate = (isoString: string | Date) => {
    const date = new Date(isoString);

    return date.toISOString().slice(0, 10);
};

export const getDatabaseByOrigin = (
    dbConfig: DBConfigMap,
    origin: string
): [string, DBConfigIF] => {
    if (origin.includes("localhost")) {
        return ["default", dbConfig.default];
    }

    const dbNaming = Object.entries(dbConfig).find(([, cfg]) => cfg.host === origin);

    if (!dbNaming) {
        throw new Error(`Unknown origin: ${origin}`);
    }

    return dbNaming;
};

export const getDatabaseName = (dbConfig: DBConfigMap, origin: string, isDev: boolean) => {
    const match = getDatabaseByOrigin(dbConfig, origin);

    if (!match) {
        throw new Error(`Unknown origin: ${origin}`);
    }

    const [, cfg] = match;

    return isDev ? cfg.dev : cfg.prod;
};
