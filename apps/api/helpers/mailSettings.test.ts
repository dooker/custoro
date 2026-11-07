import { describe, expect, it } from "vitest";
import {
    formatMailSettings,
    oneLine,
    parseLegacyEmailEnv,
    parseMailSettings,
    resolveMailSettings
} from "./mailSettings";

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
