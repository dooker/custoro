import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDbSsl } from "../config/dbSsl";

const saved = { ...process.env };

afterEach(() => {
    process.env = { ...saved };
});

beforeEach(() => {
    process.env.DB_HOST = "db.example.test";
    delete process.env.DB_SSL_CA;
});

describe("getDbSsl", () => {
    it("uses the default when DB_SSL is not set", () => {
        delete process.env.DB_SSL;

        expect(getDbSsl("off")).toBeUndefined();
        expect(getDbSsl("verify")).toEqual({ rejectUnauthorized: true, verifyIdentity: true });
    });

    it("lets DB_SSL override the default, in any case", () => {
        process.env.DB_SSL = "VERIFY";
        expect(getDbSsl("off")).toEqual({ rejectUnauthorized: true, verifyIdentity: true });

        process.env.DB_SSL = "off";
        expect(getDbSsl("verify")).toBeUndefined();
    });

    it("always checks the certificate and its host name when TLS is on", () => {
        process.env.DB_SSL = "verify";

        expect(getDbSsl("off")).toMatchObject({ rejectUnauthorized: true, verifyIdentity: true });
    });

    it("refuses an IP address, which no certificate name can be checked against", () => {
        process.env.DB_SSL = "verify";
        process.env.DB_HOST = "10.0.0.5";

        expect(() => getDbSsl("off")).toThrow(/host name/);
    });

    it("allows an IP address without TLS", () => {
        process.env.DB_SSL = "off";
        process.env.DB_HOST = "10.0.0.5";

        expect(getDbSsl("verify")).toBeUndefined();
    });

    it("reads the CA certificate from DB_SSL_CA", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dbssl-"));
        const caFile = path.join(dir, "ca.pem");

        fs.writeFileSync(caFile, "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----\n");
        process.env.DB_SSL = "verify";
        process.env.DB_SSL_CA = caFile;

        expect(getDbSsl("off")).toEqual({
            rejectUnauthorized: true,
            verifyIdentity: true,
            ca: fs.readFileSync(caFile, "utf8")
        });
    });

    it.each(["insecure", "true", "required"])("refuses the unknown mode %s", (mode) => {
        process.env.DB_SSL = mode;

        expect(() => getDbSsl("off")).toThrow(/DB_SSL must be/);
    });
});
