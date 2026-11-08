import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, isEncrypted, mailSettingsKey } from "./mailSecret";

const key = "a".repeat(64);
const otherKey = "b".repeat(64);

describe("mail password encryption", () => {
    it.each(["secret", 'p#ss"w\\rd ÕÄÖÜ €', "x".repeat(500)])(
        "opens what it sealed: %s",
        (plain) => {
            const sealed = encryptSecret(plain, key);

            expect(isEncrypted(sealed)).toBe(true);
            expect(sealed).not.toContain(plain);
            expect(decryptSecret(sealed, key)).toBe(plain);
        }
    );

    it("seals the same password differently every time", () => {
        expect(encryptSecret("secret", key)).not.toBe(encryptSecret("secret", key));
    });

    it("cannot open it without the key or with another one", () => {
        const sealed = encryptSecret("secret", key);

        expect(decryptSecret(sealed, undefined)).toBeNull();
        expect(decryptSecret(sealed, otherKey)).toBeNull();
    });

    it("refuses a changed or broken value instead of returning garbage", () => {
        const sealed = encryptSecret("secret", key);
        const [iv, tag, data] = sealed.slice("enc:v1:".length).split(":");
        const flipped = Buffer.from(data, "base64");

        flipped[0] ^= 1;

        expect(decryptSecret(`enc:v1:${iv}:${tag}:${flipped.toString("base64")}`, key)).toBeNull();
        expect(decryptSecret("enc:v1:", key)).toBeNull();
        expect(decryptSecret("enc:v1:not:base64", key)).toBeNull();
    });

    it("passes a plain password from before encryption through", () => {
        expect(decryptSecret("old plain password", key)).toBe("old plain password");
        expect(decryptSecret("old plain password", undefined)).toBe("old plain password");
    });
});

describe("mailSettingsKey", () => {
    it("uses a key of at least 32 characters", () => {
        expect(mailSettingsKey({ MAIL_SETTINGS_KEY: key })).toBe(key);
        expect(mailSettingsKey({ MAIL_SETTINGS_KEY: ` ${key} ` })).toBe(key);
    });

    it("has none when it is unset or too short", () => {
        expect(mailSettingsKey({})).toBeUndefined();
        expect(mailSettingsKey({ MAIL_SETTINGS_KEY: "short" })).toBeUndefined();
    });
});
