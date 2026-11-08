import { describe, expect, it } from "vitest";
import {
    formatMailSettings,
    hasPlainPassword,
    oneLine,
    openMailSettings,
    parseLegacyEmailEnv,
    parseMailSettings,
    resolveMailSettings
} from "./mailSettings";
import { decryptSecret, isEncrypted } from "./mailSecret";

describe("oneLine", () => {
    it("removes every kind of line break and NUL", () => {
        expect(oneLine("a\nb\r\nc\rd\u2028e\u2029f\0g")).toBe("abcdefg");
    });

    it("leaves other text alone", () => {
        expect(oneLine("smtp.example.test")).toBe("smtp.example.test");
        expect(oneLine("p@ss word=1")).toBe("p@ss word=1");
    });
});

describe("formatMailSettings and parseMailSettings", () => {
    const roundTrip = (next: Parameters<typeof formatMailSettings>[0], current = {}) =>
        parseMailSettings(formatMailSettings(next, current));

    it("write and read the four mail settings", () => {
        const values = {
            host: "smtp.example.test",
            port: "587",
            username: "mailer",
            password: "secret"
        };

        expect(roundTrip(values)).toEqual(values);
    });

    // The bug this fixes: .env.email was read with dotenv, which ends an unquoted value at " #"
    // and cannot hold every mix of quotes
    it("keep a password exactly as it was typed", () => {
        for (const password of [
            "pa ss #word",
            "#start",
            "a'b\"c`d",
            '"quoted"',
            "'single'",
            "back\\slash\\n",
            "$HOME ${JWT_SECRET}",
            "=equals=",
            "ünïcødé 🔑"
        ]) {
            expect(roundTrip({ password }).password, password).toBe(password);
        }
    });

    it("keep the current value of a setting that was not sent or was sent empty", () => {
        expect(
            roundTrip(
                { host: "new.example.test", port: "", password: undefined },
                { host: "old.example.test", port: "465", username: "mailer", password: "secret" }
            )
        ).toEqual({
            host: "new.example.test",
            port: "465",
            username: "mailer",
            password: "secret"
        });
    });

    it("never write the text undefined for a setting nobody has set", () => {
        const content = formatMailSettings({ host: "smtp.example.test" }, {});

        expect(content).not.toContain("undefined");
        expect(JSON.parse(content)).toEqual({
            host: "smtp.example.test",
            port: "",
            username: "",
            password: ""
        });
    });

    it("write only the four settings, each on one line", () => {
        const evil = "x\nJWT_SECRET=y";
        const content = formatMailSettings(
            { host: evil, port: evil, username: evil, password: evil },
            {}
        );

        expect(Object.keys(JSON.parse(content)).sort()).toEqual([
            "host",
            "password",
            "port",
            "username"
        ]);
        expect(parseMailSettings(content).host).toBe("xJWT_SECRET=y");
    });

    it("read nothing from a file that is not a JSON object, and only text values", () => {
        for (const text of ["", "not json", "[]", "null", "42", '"text"']) {
            expect(parseMailSettings(text), text).toEqual({});
        }

        expect(
            parseMailSettings('{"host": 5, "port": "25", "other": "x", "password": null}')
        ).toEqual({
            port: "25"
        });
    });
});

describe("parseLegacyEmailEnv", () => {
    it("reads the four settings of an old .env.email and nothing else", () => {
        expect(
            parseLegacyEmailEnv(
                "EMAIL_HOST=smtp.example.test\nEMAIL_PORT=465\nEMAIL_USER=mailer\nEMAIL_PASS=secret\nJWT_SECRET=x\n"
            )
        ).toEqual({
            host: "smtp.example.test",
            port: "465",
            username: "mailer",
            password: "secret"
        });
    });
});

describe("resolveMailSettings", () => {
    const env = {
        EMAIL_HOST: "env.example.test",
        EMAIL_PORT: "587",
        EMAIL_USER: "env-user",
        EMAIL_PASS: "env-pass"
    };

    // The bug this fixes: the production compose file sets every EMAIL_ variable, empty when
    // unset, and dotenv never overrides a variable that exists, so after a restart the settings
    // saved on the admin page were not used
    it("prefers what the admin saved, also over an empty environment variable", () => {
        expect(
            resolveMailSettings(
                { host: "saved.example.test", password: "saved-pass" },
                { EMAIL_HOST: "", EMAIL_PORT: "", EMAIL_USER: "", EMAIL_PASS: "" }
            )
        ).toEqual({
            host: "saved.example.test",
            port: undefined,
            username: undefined,
            password: "saved-pass"
        });
    });

    it("takes each setting the admin has not saved from the environment", () => {
        expect(resolveMailSettings({ host: "saved.example.test" }, env)).toEqual({
            host: "saved.example.test",
            port: "587",
            username: "env-user",
            password: "env-pass"
        });
    });
});

describe("the mail password at rest", () => {
    const key = "k".repeat(64);
    const read = (content: string) => parseMailSettings(content);

    it("stores a new password encrypted when there is a key", () => {
        const saved = read(
            formatMailSettings({ host: "smtp.example.test", password: "new secret" }, {}, key)
        );

        expect(isEncrypted(saved.password)).toBe(true);
        expect(decryptSecret(saved.password ?? "", key)).toBe("new secret");
        expect(saved.host).toBe("smtp.example.test");
    });

    it("keeps an encrypted password as it is when only other fields change", () => {
        const before = read(formatMailSettings({ password: "kept secret" }, {}, key));
        const after = read(formatMailSettings({ host: "other.example.test" }, before, key));

        expect(after.password).toBe(before.password);
    });

    it("keeps an encrypted password it cannot open, rather than losing it", () => {
        const before = read(formatMailSettings({ password: "kept secret" }, {}, key));
        const after = read(formatMailSettings({ port: "465" }, before, undefined));

        expect(after.password).toBe(before.password);
    });

    it("encrypts a plain password from before on the next save", () => {
        const plain = read(formatMailSettings({ password: "old secret" }, {}));

        expect(hasPlainPassword(plain)).toBe(true);

        const sealed = read(formatMailSettings({}, plain, key));

        expect(hasPlainPassword(sealed)).toBe(false);
        expect(decryptSecret(sealed.password ?? "", key)).toBe("old secret");
    });

    it("encrypts a newly typed password even when it looks encrypted", () => {
        const saved = read(formatMailSettings({ password: "enc:v1:secret123" }, {}, key));

        expect(saved.password).not.toBe("enc:v1:secret123");
        expect(decryptSecret(saved.password ?? "", key)).toBe("enc:v1:secret123");
    });

    it("stores it as typed without a key, as before", () => {
        expect(read(formatMailSettings({ password: "plain" }, {})).password).toBe("plain");
    });

    it("opens the password for sending, and says why when it cannot", () => {
        const sealed = read(formatMailSettings({ username: "u", password: "s3cret" }, {}, key));
        const reports: string[] = [];

        expect(openMailSettings(sealed, key, (m) => reports.push(m))).toEqual({
            username: "u",
            password: "s3cret"
        });
        expect(
            openMailSettings(sealed, "x".repeat(64), (m) => reports.push(m)).password
        ).toBeUndefined();
        expect(
            openMailSettings(sealed, undefined, (m) => reports.push(m)).password
        ).toBeUndefined();
        expect(reports).toHaveLength(2);
        expect(reports[0]).toMatch(/another MAIL_SETTINGS_KEY/);
        expect(reports[1]).toMatch(/MAIL_SETTINGS_KEY is not set/);
    });
});
