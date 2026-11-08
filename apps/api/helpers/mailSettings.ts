// The mail server settings the admin saves on the settings page, without the file system, so the
// rules can be unit tested. helper.ts reads the file and services/settings.ts writes it.
//
// They are kept as JSON in the storage volume (config/paths.ts), so they survive a new container
// and are in every backup. JSON holds any text as it was typed: the old .env.email file was read
// with dotenv, which cut a password at a "#" and could not hold every mix of quotes.
import * as dotenv from "dotenv";
import type { MailField } from "./settingsInput";
import { decryptSecret, encryptSecret, isEncrypted } from "./mailSecret";

export type MailValues = Partial<Record<MailField, string | undefined>>;

const mailFieldNames: MailField[] = ["host", "port", "username", "password"];

// The environment variables that give a mail setting the admin page has not set
export const emailEnvKeys: Record<MailField, string> = {
    host: "EMAIL_HOST",
    port: "EMAIL_PORT",
    username: "EMAIL_USER",
    password: "EMAIL_PASS"
};

// Every character that ends a line, and NUL: none belongs in a host, port, user or password
export const oneLine = (value: string) => value.replace(/[\r\n\u2028\u2029\0]/g, "");

// Only the four settings, and only text: whatever else the file holds is ignored
const pickMailValues = (source: Record<string, unknown>, key: (field: MailField) => string) =>
    mailFieldNames.reduce<MailValues>((values, field) => {
        const value = source[key(field)];

        if (typeof value === "string" && value !== "") {
            values[field] = value;
        }

        return values;
    }, {});

/** The settings in the file's text, or none when it is not a JSON object. */
export const parseMailSettings = (text: string): MailValues => {
    try {
        const parsed: unknown = JSON.parse(text);

        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? pickMailValues(parsed as Record<string, unknown>, (field) => field)
            : {};
    } catch {
        return {};
    }
};

/** The settings in an old .env.email file, read until the admin saves them again. */
export const parseLegacyEmailEnv = (text: string): MailValues =>
    pickMailValues(dotenv.parse(text), (field) => emailEnvKeys[field]);

/**
 * The file's new content: the new value of each field, or the one it had when no new value (or
 * an empty one) was sent. Only the four settings, each on one line. With a key the password is
 * stored encrypted (helpers/mailSecret.ts): a new one, and a plain one the file still had. One
 * already encrypted is kept as it is, so saving other fields never needs to open it.
 */
export const formatMailSettings = (next: MailValues, current: MailValues, key?: string) => {
    const values = Object.fromEntries(
        mailFieldNames.map((field) => [field, oneLine(next[field] || current[field] || "")])
    ) as Record<MailField, string>;

    if (key && values.password && !isEncrypted(values.password)) {
        values.password = encryptSecret(values.password, key);
    }

    return `${JSON.stringify(values, null, 4)}\n`;
};

/** Whether the file holds a password that a key would encrypt (one from before encryption) */
export const hasPlainPassword = (saved: MailValues) =>
    !!saved.password && !isEncrypted(saved.password);

/**
 * The saved settings with the password opened. A password that cannot be opened (no key, or
 * another one) is left out, so mail falls back to EMAIL_PASS or fails as "missingInfo", and
 * `report` says why: the admin saves the password again.
 */
export const openMailSettings = (
    saved: MailValues,
    key: string | undefined,
    report: (message: string) => void = console.error
): MailValues => {
    if (!saved.password) {
        return saved;
    }

    const password = decryptSecret(saved.password, key);

    if (password === null) {
        report(
            key
                ? "The saved mail server password was encrypted with another MAIL_SETTINGS_KEY: save it again on the settings page"
                : "The saved mail server password is encrypted, but MAIL_SETTINGS_KEY is not set"
        );

        return { ...saved, password: undefined };
    }

    return { ...saved, password };
};

/** What the API sends mail with: the saved setting, else the environment's, per field. */
export const resolveMailSettings = (
    saved: MailValues,
    env: Record<string, string | undefined>
): MailValues =>
    Object.fromEntries(
        mailFieldNames.map((field) => [
            field,
            saved[field] || env[emailEnvKeys[field]] || undefined
        ])
    );
