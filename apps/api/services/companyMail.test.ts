import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { createFakeDb } from "../helper/testing/fakeDb";
import { testCaller } from "../helper/testing/caller";
import { decryptSecret, encryptSecret } from "../helpers/mailSecret";

// Every company has its own mail server, saved as rows of its config; the password only encrypted
const fake = createFakeDb();
const queryMock = vi.fn();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "custoro-company-mail-"));
const files = {
    mailSettingsFile: path.join(dir, "mail-settings.json"),
    legacyEmailEnvFile: path.join(dir, ".env.email")
};

vi.mock("../config/paths", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../config/paths")>()),
    get mailSettingsFile() {
        return files.mailSettingsFile;
    },
    get legacyEmailEnvFile() {
        return files.legacyEmailEnvFile;
    }
}));
vi.mock("../db", () => ({ getPool: () => fake.pool }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("../helper/query", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../helper/query")>()),
    query: queryMock
}));

const { saveCompanyMail, companyMailServer, moveSavedMailToCompanyOne } =
    await import("./companyMail");
const { putAll, getAll } = await import("./settings");

const key = "k".repeat(64);
const otherKey = "x".repeat(64);
const env = [
    "EMAIL_HOST",
    "EMAIL_PORT",
    "EMAIL_USER",
    "EMAIL_PASS",
    "EMAIL_FROM",
    "MAIL_SETTINGS_KEY",
    "MAIL_ALLOW_PRIVATE_HOSTS"
];
const savedEnv = Object.fromEntries(env.map((name) => [name, process.env[name]]));

// The config rows of the company the query reads: name -> value
const companyRows = (rows: Record<string, string>) =>
    queryMock.mockImplementation(async ({ sql }: { sql: string }) =>
        /FROM config/.test(sql)
            ? {
                  success: true,
                  data: Object.entries(rows).map(([name, value]) => ({ name, value }))
              }
            : { success: true, data: [] }
    );

const request = (body: object, user = testCaller) =>
    ({ database: "shop", user, params: {}, query: {}, body }) as unknown as Request;

beforeEach(() => {
    fake.reset();
    queryMock.mockReset();
    fs.rmSync(files.mailSettingsFile, { force: true });
    fs.rmSync(files.legacyEmailEnvFile, { force: true });
    for (const name of env) process.env[name] = "";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
    for (const [name, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
});

describe("saveCompanyMail", () => {
    it("stores a typed password only encrypted, in the company's own rows", async () => {
        expect(
            await saveCompanyMail(
                "shop",
                3,
                { host: " smtp.example.test ", port: "587", password: "pa ss #1" },
                key
            )
        ).toEqual({ ok: true });

        const [create] = fake.statements(/INSERT IGNORE INTO config/);
        const [update] = fake.statements(/UPDATE config/);

        // missing rows are made for company 3 only
        expect(create.params[0]).toEqual([
            [3, "mailHost", "", ""],
            [3, "mailPort", "", ""],
            [3, "mailPassword", "", ""]
        ]);
        expect(update.sql).toContain("WHERE tenant_id = ?");
        const values = update.params as string[];
        const stored = values[values.indexOf("mailPassword") + 1];

        expect(values).toContain("smtp.example.test");
        expect(values).not.toContain("pa ss #1");
        expect(stored).toMatch(/^enc:v1:/);
        expect(decryptSecret(stored, key)).toBe("pa ss #1");
        expect(values.slice(-4)).toEqual([3, "mailHost", "mailPort", "mailPassword"]);
    });

    it("refuses a typed password without MAIL_SETTINGS_KEY and saves nothing", async () => {
        expect(
            await saveCompanyMail(
                "shop",
                3,
                { host: "smtp.example.test", password: "secret" },
                undefined
            )
        ).toEqual({ ok: false, message: "mailKeyMissing" });
        expect(fake.calls).toHaveLength(0);
    });

    it("keeps the saved password when the field is empty, and saves the rest", async () => {
        expect(
            await saveCompanyMail(
                "shop",
                3,
                { username: "bills", password: "", from: "Bills <b@x.test>" },
                undefined
            )
        ).toEqual({ ok: true });

        const [update] = fake.statements(/UPDATE config/);

        expect(update.params).not.toContain("mailPassword");
        expect(update.params).toEqual(
            expect.arrayContaining(["mailUser", "bills", "mailFrom", "Bills <b@x.test>"])
        );
    });

    it("does nothing when no mail setting was sent", async () => {
        expect(await saveCompanyMail("shop", 3, {}, key)).toEqual({ ok: true });
        expect(fake.calls).toHaveLength(0);
    });
});

describe("companyMailServer", () => {
    it("sends with the company's own server, sender and opened password", async () => {
        // the test resolves no names: the host check is helpers/mailHost.test.ts's
        process.env.MAIL_ALLOW_PRIVATE_HOSTS = "true";
        process.env.MAIL_SETTINGS_KEY = key;
        process.env.EMAIL_PASS = "the default's password";
        companyRows({
            mailHost: "smtp.company.test",
            mailPort: "465",
            mailUser: "bills@company.test",
            mailPassword: encryptSecret("company secret", key),
            mailFrom: "Company <bills@company.test>"
        });

        expect(await companyMailServer("shop", 3)).toEqual({
            host: "smtp.company.test",
            port: "465",
            username: "bills@company.test",
            password: "company secret",
            from: "Company <bills@company.test>",
            usesDefault: false,
            connectTo: "smtp.company.test"
        });
        expect(queryMock.mock.calls[0][0].params[0]).toBe(3);
    });

    it("never takes the default's password for a company's own server", async () => {
        process.env.MAIL_SETTINGS_KEY = otherKey;
        process.env.EMAIL_PASS = "the default's password";
        companyRows({ mailHost: "smtp.company.test", mailPassword: encryptSecret("x", key) });

        const server = await companyMailServer("shop", 3);

        expect(server.password).toBeUndefined();
        expect(server.usesDefault).toBe(false);
    });

    it("refuses a company's own server inside the server's network", async () => {
        companyRows({ mailHost: "127.0.0.1", mailPort: "3306" });

        expect(await companyMailServer("shop", 3)).toMatchObject({
            usesDefault: false,
            refused: "mailHostNotAllowed"
        });
    });

    it("refuses to save such a server, before anything is written", async () => {
        expect(await saveCompanyMail("shop", 3, { host: "10.0.0.5" }, key)).toEqual({
            ok: false,
            message: "mailHostNotAllowed"
        });
        expect(await saveCompanyMail("shop", 3, { port: "3306" }, key)).toEqual({
            ok: false,
            message: "mailHostNotAllowed"
        });
        expect(fake.calls).toHaveLength(0);
    });

    it("refuses to send when the company's settings cannot be read, instead of the default", async () => {
        // Copilot review of PR 40: a failed read looked like "no server of its own"
        process.env.EMAIL_HOST = "smtp.default.test";
        process.env.EMAIL_PASS = "default secret";
        queryMock.mockResolvedValue({ success: false, data: [] });

        expect(await companyMailServer("shop", 3)).toMatchObject({ refused: "error" });
    });

    it("uses the install's default server and sender for a company without its own", async () => {
        process.env.EMAIL_HOST = "smtp.default.test";
        process.env.EMAIL_PASS = "default secret";
        process.env.EMAIL_FROM = "Custoro <no-reply@default.test>";
        companyRows({});

        expect(await companyMailServer("shop", 4)).toMatchObject({
            host: "smtp.default.test",
            password: "default secret",
            from: "Custoro <no-reply@default.test>",
            usesDefault: true
        });
    });
});

describe("the settings page", () => {
    it("never answers with a mail row, also not to a regular user who asks for it by name", async () => {
        companyRows({ companyName: "Acme", mailHost: "smtp.acme.test", mailPassword: "enc:v1:x" });

        const user = { ...testCaller, role: "user" };
        const all = await getAll(request({}, user));

        // asked by name, the database gives just those rows
        companyRows({ mailHost: "smtp.acme.test", mailPassword: "enc:v1:x" });
        const named = await getAll({
            ...request({}, user),
            query: { fields: "mailPassword,mailHost" }
        } as unknown as Request);

        expect(all.data?.[0]).toEqual({ companyName: "Acme" });
        expect(named.data?.[0]).toEqual({});
    });

    it("shows an admin the company's server and whether a password is saved, never the password", async () => {
        companyRows({ mailHost: "smtp.acme.test", mailUser: "bills", mailPassword: "enc:v1:x" });

        const [settings] = (await getAll(request({}))).data ?? [];

        expect(settings).toMatchObject({
            host: "smtp.acme.test",
            port: "",
            username: "bills",
            from: "",
            mailPasswordSaved: "1",
            mailUsesDefault: ""
        });
        expect(settings).not.toHaveProperty("password");
        expect(JSON.stringify(settings)).not.toContain("enc:v1:x");
    });

    it("refuses a typed password without MAIL_SETTINGS_KEY", async () => {
        companyRows({});

        expect(await putAll(request({ host: "smtp.acme.test", password: "secret" }))).toEqual({
            success: false,
            message: "mailKeyMissing"
        });
    });
});

describe("moveSavedMailToCompanyOne", () => {
    // The made-up hosts below do not resolve: the host rule has its own tests (mailHost.test.ts)
    // and one case here with the rule on
    beforeEach(() => {
        process.env.MAIL_ALLOW_PRIVATE_HOSTS = "true";
    });

    it("moves the file's settings into company 1, an encrypted password as it is", async () => {
        const encrypted = encryptSecret("old secret", key);
        fs.writeFileSync(
            files.mailSettingsFile,
            JSON.stringify({
                host: "smtp.old.test",
                port: "587",
                username: "old",
                password: encrypted
            })
        );
        companyRows({});

        expect(await moveSavedMailToCompanyOne("shop", key, () => undefined)).toBe(true);
        const updates = fake.statements(/UPDATE config/);

        expect(updates.map(({ params }) => params)).toEqual([
            ["smtp.old.test", 1, "mailHost"],
            ["587", 1, "mailPort"],
            ["old", 1, "mailUser"],
            [encrypted, 1, "mailPassword"]
        ]);
    });

    it("waits for a key instead of moving without the password, and moves it once there is one", async () => {
        // Copilot review of PR 40: the host moved without the plain password, so company 1 left
        // the working default for a server it cannot log in to, and was never moved again
        fs.writeFileSync(
            files.mailSettingsFile,
            JSON.stringify({ host: "smtp.old.test", username: "old", password: "plain" })
        );
        companyRows({});
        const log = vi.fn();

        expect(await moveSavedMailToCompanyOne("shop", undefined, log)).toBe(false);
        expect(fake.calls).toHaveLength(0);
        expect(log).toHaveBeenCalledWith(expect.stringMatching(/MAIL_SETTINGS_KEY/));

        // the next start, with a key: everything moves, the password encrypted
        expect(await moveSavedMailToCompanyOne("shop", key, () => undefined)).toBe(true);
        const stored = fake
            .statements(/UPDATE config/)
            .find(({ params }) => params[2] === "mailPassword")?.params[0] as string;

        expect(decryptSecret(stored, key)).toBe("plain");
    });

    it("moves the settings mail was really sent with: the file's, else EMAIL_*, and EMAIL_FROM", async () => {
        // Copilot review of PR 40: only the file's fields moved, so a port, login or sender that
        // came from the environment was lost once company 1 had a server of its own
        process.env.EMAIL_PORT = "465";
        process.env.EMAIL_PASS = "env secret";
        process.env.EMAIL_FROM = "Bills <bills@old.test>";
        fs.writeFileSync(
            files.mailSettingsFile,
            JSON.stringify({ host: "smtp.old.test", username: "old" })
        );
        companyRows({});

        expect(await moveSavedMailToCompanyOne("shop", key, () => undefined)).toBe(true);
        const moved = Object.fromEntries(
            fake.statements(/UPDATE config/).map(({ params }) => [params[2], params[0]])
        );

        expect(moved).toMatchObject({
            mailHost: "smtp.old.test",
            mailPort: "465",
            mailUser: "old",
            mailFrom: "Bills <bills@old.test>"
        });
        expect(decryptSecret(moved.mailPassword as string, key)).toBe("env secret");
    });

    it("leaves a saved server inside the server's network as the install's default", async () => {
        // Security review of PR 40: moved to company 1 it was checked like any company's server
        // and refused, so an install with a relay on its own network lost its mail on the update
        process.env.MAIL_ALLOW_PRIVATE_HOSTS = "false";
        fs.writeFileSync(
            files.mailSettingsFile,
            JSON.stringify({ host: "127.0.0.1", port: "25", username: "relay" })
        );
        companyRows({});
        const log = vi.fn();

        expect(await moveSavedMailToCompanyOne("shop", key, log)).toBe(false);
        expect(fake.calls).toHaveLength(0);
        expect(log).toHaveBeenCalledWith(expect.stringMatching(/stay the install's default/));
        // and company 1 still sends with it: no server of its own, so the default
        expect(await companyMailServer("shop", 1)).toMatchObject({
            host: "127.0.0.1",
            usesDefault: true
        });
    });

    it("moves nothing when company 1's settings cannot be read", async () => {
        fs.writeFileSync(files.mailSettingsFile, JSON.stringify({ host: "smtp.old.test" }));
        queryMock.mockResolvedValue({ success: false, data: [] });

        expect(await moveSavedMailToCompanyOne("shop", key, () => undefined)).toBe(false);
        expect(fake.calls).toHaveLength(0);
    });

    it("does nothing when company 1 has a server of its own already", async () => {
        fs.writeFileSync(files.mailSettingsFile, JSON.stringify({ host: "smtp.old.test" }));
        companyRows({ mailHost: "smtp.company.test" });

        expect(await moveSavedMailToCompanyOne("shop", key, () => undefined)).toBe(false);
        expect(fake.calls).toHaveLength(0);
    });
});
