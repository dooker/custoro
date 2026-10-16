import * as dotenv from "dotenv";
import { describe, expect, it } from "vitest";
import { formatEmailEnv, oneLine } from "./emailEnv";

describe("oneLine", () => {
    it("removes every kind of line break and NUL", () => {
        expect(oneLine("a\nb\r\nc\rd\u2028e\u2029f\0g")).toBe("abcdefg");
    });

    it("leaves other text alone", () => {
        expect(oneLine("smtp.example.test")).toBe("smtp.example.test");
        expect(oneLine("p@ss word=1")).toBe("p@ss word=1");
    });
});

describe("formatEmailEnv", () => {
    const parse = (content: string) => dotenv.parse(content);

    it("writes the four mail settings", () => {
        const content = formatEmailEnv(
            { host: "smtp.example.test", port: "587", username: "mailer", password: "secret" },
            {}
        );

        expect(parse(content)).toEqual({
            EMAIL_HOST: "smtp.example.test",
            EMAIL_PORT: "587",
            EMAIL_USER: "mailer",
            EMAIL_PASS: "secret"
        });
    });

    // The bug this fixes: a value could carry a second line, and with it any variable
    it("cannot be made to write any other variable", () => {
        for (const evil of [
            "x\nJWT_SECRET=y",
            "x\r\nJWT_SECRET=y",
            "x\rJWT_SECRET=y",
            "x\u2028JWT_SECRET=y",
            "x\n\nNODE_OPTIONS=--require /tmp/a.js"
        ]) {
            const parsed = parse(
                formatEmailEnv({ host: evil, port: evil, username: evil, password: evil }, {})
            );

            expect(Object.keys(parsed).sort(), JSON.stringify(evil)).toEqual([
                "EMAIL_HOST",
                "EMAIL_PASS",
                "EMAIL_PORT",
                "EMAIL_USER"
            ]);
        }
    });

    it("keeps the current value of a setting that was not sent or was sent empty", () => {
        const parsed = parse(
            formatEmailEnv(
                { host: "new.example.test", port: "", password: undefined },
                { host: "old.example.test", port: "465", username: "mailer", password: "secret" }
            )
        );

        expect(parsed).toEqual({
            EMAIL_HOST: "new.example.test",
            EMAIL_PORT: "465",
            EMAIL_USER: "mailer",
            EMAIL_PASS: "secret"
        });
    });

    // The bug this fixes: unset settings were written as the text "undefined"
    it("writes a setting nobody has set as empty, never as the text undefined", () => {
        const content = formatEmailEnv({ host: "smtp.example.test" }, {});

        expect(content).not.toContain("undefined");
        expect(parse(content)).toEqual({
            EMAIL_HOST: "smtp.example.test",
            EMAIL_PORT: "",
            EMAIL_USER: "",
            EMAIL_PASS: ""
        });
    });
});
