// The mail server password at rest. The mail server needs the password itself to log in, so it
// cannot be hashed like a login password; it is encrypted instead (AES-256-GCM), with a key from
// MAIL_SETTINGS_KEY that lives in the environment (.env), never in the storage folder or its
// backups. A stolen backup then holds no usable password. Whoever runs the API has the key too:
// this protects copies of the file, not a server that has been taken over.
import crypto from "node:crypto";

const prefix = "enc:v1:";

/** The shortest MAIL_SETTINGS_KEY accepted: what `openssl rand -hex 32` gives is 64 */
export const minMailKeyLength = 32;

/** MAIL_SETTINGS_KEY when it is long enough to use, else undefined */
export const mailSettingsKey = (env: Record<string, string | undefined> = process.env) => {
    const key = env.MAIL_SETTINGS_KEY?.trim();

    return key && key.length >= minMailKeyLength ? key : undefined;
};

// 32 bytes for AES-256 from a key of any form (hex, base64, a phrase)
const derive = (key: string) =>
    Buffer.from(crypto.hkdfSync("sha256", key, "custoro-mail-settings", "mail password v1", 32));

export const isEncrypted = (value: string | undefined) => !!value?.startsWith(prefix);

/** enc:v1:<iv>:<tag>:<ciphertext>, base64; a new random IV every time */
export const encryptSecret = (plain: string, key: string) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", derive(key), iv);
    const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);

    return `${prefix}${[iv, cipher.getAuthTag(), data].map((part) => part.toString("base64")).join(":")}`;
};

/**
 * The password: a plain one (a file from before encryption) as it is, an encrypted one opened
 * with the key. Null when it cannot be opened: no key, another key, or a changed file.
 */
export const decryptSecret = (value: string, key: string | undefined): string | null => {
    if (!isEncrypted(value)) {
        return value;
    }

    if (!key) {
        return null;
    }

    try {
        const [iv, tag, data] = value
            .slice(prefix.length)
            .split(":")
            .map((part) => Buffer.from(part, "base64"));
        const decipher = crypto.createDecipheriv("aes-256-gcm", derive(key), iv);

        decipher.setAuthTag(tag);

        return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch {
        return null;
    }
};
