// The mail server settings file (.env.email), without the file system, so it can be unit tested.
// The admin's settings page writes it and the API reads it back into process.env, so a value
// must stay one value: a line break would add a second line, and with it any variable.
import type { MailField } from "./settingsInput";

export const emailEnvKeys: Record<MailField, string> = {
    host: "EMAIL_HOST",
    port: "EMAIL_PORT",
    username: "EMAIL_USER",
    password: "EMAIL_PASS"
};

// Every character that ends a line for dotenv or a person reading the file, and NUL
export const oneLine = (value: string) => value.replace(/[\r\n\u2028\u2029\0]/g, "");

type MailValues = Partial<Record<MailField, string | undefined>>;

/**
 * The content of .env.email: the new value of each field, or the one it had when no new value
 * (or an empty one) was sent, or nothing. Always exactly the four EMAIL_ lines.
 */
export const formatEmailEnv = (next: MailValues, current: MailValues) =>
    (Object.keys(emailEnvKeys) as MailField[])
        .map((field) => `${emailEnvKeys[field]}=${oneLine(next[field] || current[field] || "")}`)
        .join("\n");
