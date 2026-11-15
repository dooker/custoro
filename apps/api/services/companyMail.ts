// Every company sends its invoices and password emails through its own mail server (docs/multi-
// tenant.md). The server's host, port, login, password and sender are rows of the company's config.
// The mail server needs the password itself to log in, so it cannot be hashed like a login
// password: it is stored encrypted only (AES-256-GCM, helpers/mailSecret.ts) with a key from
// MAIL_SETTINGS_KEY, which lives in the environment, never in the database or its backups. Without
// the key a typed password is refused, so none is ever stored as plain text. A company that has
// not set a server sends with the install's default (the old storage/mail-settings.json, else the
// EMAIL_ variables), so an install that worked before keeps working.
import fs from "node:fs";
import { query } from "../helper/query";
import { withTransaction } from "../helper/transaction";
import { getMailSettings, readSavedMailSettings } from "../helper";
import { encryptSecret, isEncrypted, mailSettingsKey } from "../helpers/mailSecret";
import {
    openMailSettings,
    oneLine,
    resolveMailSettings,
    type MailValues
} from "../helpers/mailSettings";
import { mailSettingsFile } from "../config/paths";
import type { MailField } from "../helpers/settingsInput";
import { mailPort } from "../helpers/mailTransport";
import {
    allowPrivateMailHosts,
    checkCompanyMailHost,
    isPrivateAddress,
    mailHostNotAllowedMessage,
    mailPorts
} from "../helpers/mailHost";
import net from "node:net";

/** The config rows of a company's mail server, by the field of the settings page */
export const companyMailRows: Record<MailField, string> = {
    host: "mailHost",
    port: "mailPort",
    username: "mailUser",
    password: "mailPassword",
    from: "mailFrom"
};

const rowNames = Object.values(companyMailRows);

export type CompanyMail = Partial<Record<MailField, string>>;

/** The message when a password is typed but there is no key to encrypt it with */
export const mailKeyMissingMessage = "mailKeyMissing";

/**
 * A company's saved mail settings, as stored: the password still encrypted. Null when they cannot
 * be read: a failed read is not "no server of its own" (Copilot review of PR 40), so no caller
 * falls back to the default server or overwrites the settings on it.
 */
export const readCompanyMail = async (
    database: string,
    tenantId: number
): Promise<CompanyMail | null> => {
    const { success, data } = await query<{ name: string; value: string }>({
        database,
        sql: `SELECT name, value
              FROM config
              WHERE tenant_id = ?
                AND name IN (${rowNames.map(() => "?").join(", ")});`,
        params: [tenantId, ...rowNames],
        logger: "Get the company's mail settings"
    });

    if (!success) {
        return null;
    }

    const saved: CompanyMail = {};

    for (const [field, name] of Object.entries(companyMailRows)) {
        const value = data?.find((row) => row.name === name)?.value;

        if (value) {
            saved[field as MailField] = value;
        }
    }

    return saved;
};

export interface MailServer {
    host?: string;
    port?: string;
    username?: string;
    password?: string;
    from?: string;
    // The company has no server of its own: the install's default is used
    usesDefault: boolean;
    // A company's own server: the address it was checked at, or why it may not be used
    connectTo?: string;
    refused?: string;
}

/**
 * What a company's mail goes out with: its own server when it has set a host, with the password
 * opened; else the install's default server and sender. The two are never mixed: a company's own
 * server never gets the default's password.
 */
export const companyMailServer = async (
    database: string,
    tenantId: number
): Promise<MailServer> => {
    const saved = await readCompanyMail(database, tenantId);

    if (!saved) {
        return { usesDefault: false, refused: "error" };
    }

    if (!saved.host) {
        return { ...getMailSettings(), from: process.env.EMAIL_FROM, usesDefault: true };
    }

    const opened = openMailSettings(saved as MailValues, mailSettingsKey());
    // Never a connection to the server's own network on a company's behalf (helpers/mailHost.ts)
    const checked = await checkCompanyMailHost(saved.host, mailPort(saved.port));

    return checked.ok
        ? { ...opened, from: saved.from, usesDefault: false, connectTo: checked.address }
        : { ...opened, from: saved.from, usesDefault: false, refused: checked.message };
};

/**
 * Saves the mail settings a company's admin typed. A field that was not sent stays; an empty one
 * clears it, except the password: an empty password field keeps the saved one (the page never
 * shows it). A typed password is stored encrypted, and refused without MAIL_SETTINGS_KEY.
 */
export const saveCompanyMail = async (
    database: string,
    tenantId: number,
    typed: CompanyMail,
    key: string | undefined = mailSettingsKey()
): Promise<{ ok: true } | { ok: false; message: string }> => {
    const values: [string, string][] = [];

    // A server inside the server's own network, or off the mail ports, is refused when it is saved
    // too (the name is resolved and checked again before every email)
    if (!allowPrivateMailHosts()) {
        const port = typed.port?.trim();
        const host = typed.host?.trim();

        if (
            (port && !mailPorts.includes(Number(port))) ||
            (host &&
                (host.toLowerCase() === "localhost" || (net.isIP(host) && isPrivateAddress(host))))
        ) {
            return { ok: false, message: mailHostNotAllowedMessage };
        }
    }

    for (const [field, name] of Object.entries(companyMailRows) as [MailField, string][]) {
        const value = typed[field];

        if (value === undefined) {
            continue;
        }

        const line = oneLine(value).trim();

        if (field === "password") {
            if (!line) {
                continue;
            }

            if (!key) {
                return { ok: false, message: mailKeyMissingMessage };
            }

            values.push([name, encryptSecret(line, key)]);
        } else {
            values.push([name, line]);
        }
    }

    if (!values.length) {
        return { ok: true };
    }

    const saved = await withTransaction(
        database,
        "Save the company's mail settings",
        "mailSettingsNotSaved",
        async (connection) => {
            // The rows a company does not have yet (every company before its first save)
            await connection.query(
                `INSERT IGNORE INTO config (tenant_id, name, value, long_value)
                 VALUES ?;`,
                [values.map(([name]) => [tenantId, name, "", ""])]
            );
            await connection.query(
                `UPDATE config
                 SET value = CASE ${values.map(() => "WHEN name = ? THEN ?").join(" ")} END
                 WHERE tenant_id = ?
                   AND name IN (${values.map(() => "?").join(", ")});`,
                [...values.flat(), tenantId, ...values.map(([name]) => name)]
            );
        }
    );

    return saved.ok ? { ok: true } : { ok: false, message: saved.message };
};

/**
 * At startup, once: the mail settings of an install from before companies (storage/mail-
 * settings.json, or the older .env.email) become company 1's, unless company 1 has its own
 * already: what mail was really sent with, the file's field or else the EMAIL_ variable, and
 * EMAIL_FROM as the sender. An encrypted password moves as it is; a plain one only when there is a
 * key to encrypt it with, else nothing moves until there is one (it is never stored plain in the
 * database). The file stays where it is, as a copy.
 */
export const moveSavedMailToCompanyOne = async (
    database: string,
    key: string | undefined = mailSettingsKey(),
    log: (message: string) => void = console.log
) => {
    const file = readSavedMailSettings();

    if (!file.host && !file.username && !file.password) {
        return false;
    }

    const companyOne = await readCompanyMail(database, 1);

    // Unreadable: try again at the next start rather than write over what may be there
    if (!companyOne || companyOne.host) {
        return false;
    }

    // What mail was really sent with until now: each field from the file, else from its EMAIL_
    // variable, and the sender from EMAIL_FROM. Moving only the file's fields lost a port, login or
    // sender that came from the environment once company 1 had a server of its own (Copilot
    // review of PR 40).
    const effective = resolveMailSettings(
        openMailSettings(file, key, () => undefined),
        process.env
    );
    let password: string | undefined;

    if (file.password && isEncrypted(file.password)) {
        // The file's encrypted password moves as it is (a later key can still open it)
        password = file.password;
    } else if (effective.password) {
        // A plain password is only ever stored encrypted. Without a key nothing moves yet: company
        // 1 keeps sending with the saved settings as the default, and the move happens at the first
        // start with a key (Copilot review of PR 40: moving without it left company 1 with a server
        // it could not log in to, and no later start moved it again)
        if (!key) {
            log(
                "The saved mail settings stay the default until MAIL_SETTINGS_KEY is set: their password is plain text and is only ever stored encrypted. Set the key and restart."
            );

            return false;
        }

        password = encryptSecret(effective.password, key);
    }

    const values = Object.entries({
        host: effective.host,
        port: effective.port,
        username: effective.username,
        password,
        from: process.env.EMAIL_FROM?.trim()
    }).filter(([, value]) => value) as [MailField, string][];

    // An encrypted password is stored as it is, so it goes in through the same rows directly
    const { ok } = await withTransaction(
        database,
        "Move the saved mail settings to company 1",
        "mailSettingsNotSaved",
        async (connection) => {
            await connection.query(
                `INSERT IGNORE INTO config (tenant_id, name, value, long_value)
                 VALUES ?;`,
                [values.map(([field]) => [1, companyMailRows[field], "", ""])]
            );
            for (const [field, value] of values) {
                await connection.query(
                    `UPDATE config
                     SET value = ?
                     WHERE tenant_id = ?
                       AND name = ?;`,
                    [value, 1, companyMailRows[field]]
                );
            }
        }
    );

    if (ok) {
        log(
            `The mail settings of ${fs.existsSync(mailSettingsFile) ? "storage/mail-settings.json" : ".env.email"} are now company 1's (the file stays as a copy)`
        );
    }

    return ok;
};
