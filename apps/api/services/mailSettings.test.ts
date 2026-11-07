import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";

// The mail server settings the admin saves on the settings page are kept in the storage volume
// as JSON, so they survive a new container, are in the backup and hold any password as typed
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "custoro-mail-"));
const files = {
    mailSettingsFile: path.join(dir, "storage", "mail-settings.json"),
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
vi.mock("../db", () => ({ getPool: () => ({}) }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("../helper/query", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../helper/query")>()),
    query: vi.fn(async () => ({ success: true, data: [{ value: "" }] }))
}));

const { putAll } = await import("./settings");
const { getMailSettings, readSavedMailSettings } = await import("../helper");

const put = (body: object) =>
    putAll({ database: "shop", params: {}, query: {}, body } as unknown as Request);

const emailEnv = ["EMAIL_HOST", "EMAIL_PORT", "EMAIL_USER", "EMAIL_PASS"] as const;
const savedEnv = Object.fromEntries(emailEnv.map((key) => [key, process.env[key]]));

beforeEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    files.mailSettingsFile = path.join(dir, "storage", "mail-settings.json");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // What docker-compose.prod.yml does when .env has no mail settings
    for (const key of emailEnv) process.env[key] = "";
});

afterEach(() => {
    for (const key of emailEnv) {
        if (savedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[key];
    }
});

describe("saving the mail settings", () => {
    it("writes them to the storage volume, readable only by the API, and uses them", async () => {
        const password = "pa ss #word 'and' \"quotes\"";

        expect(
            await put({ host: "smtp.example.test", port: "465", username: "mailer", password })
        ).toEqual({
            success: true
        });

        expect(JSON.parse(fs.readFileSync(files.mailSettingsFile, "utf8"))).toEqual({
            host: "smtp.example.test",
            port: "465",
            username: "mailer",
            password
        });
        expect(fs.statSync(files.mailSettingsFile).mode & 0o777).toBe(0o600);
        // Over the empty EMAIL_ variables the production compose file sets
        expect(getMailSettings()).toEqual({
            host: "smtp.example.test",
            port: "465",
            username: "mailer",
            password
        });
    });

    it("keeps the saved password when the page sends only the other settings", async () => {
        await put({ host: "smtp.example.test", password: "secret" });
        await put({ host: "smtp2.example.test", password: "" });

        expect(readSavedMailSettings()).toEqual({ host: "smtp2.example.test", password: "secret" });
    });

    it("takes a setting the admin has not saved from the environment", async () => {
        process.env.EMAIL_PORT = "587";
        await put({ host: "smtp.example.test" });

        expect(getMailSettings().port).toBe("587");
    });

    it("reads an old .env.email until they are saved again, then removes it", async () => {
        fs.writeFileSync(
            files.legacyEmailEnvFile,
            "EMAIL_HOST=old.example.test\nEMAIL_PASS=secret\n"
        );

        expect(getMailSettings()).toMatchObject({ host: "old.example.test", password: "secret" });

        await put({ port: "25" });

        expect(readSavedMailSettings()).toEqual({
            host: "old.example.test",
            port: "25",
            password: "secret"
        });
        expect(fs.existsSync(files.legacyEmailEnvFile)).toBe(false);
    });

    it("says so when they cannot be written, and keeps the old file whole", async () => {
        await put({ host: "smtp.example.test", password: "secret" });
        vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
            throw new Error("ENOSPC: no space left on device");
        });

        expect(await put({ host: "other.example.test" })).toEqual({
            success: false,
            message: "mailSettingsNotSaved"
        });
        expect(readSavedMailSettings()).toEqual({ host: "smtp.example.test", password: "secret" });
        expect(fs.readdirSync(path.dirname(files.mailSettingsFile))).toEqual([
            "mail-settings.json"
        ]);
    });
});
