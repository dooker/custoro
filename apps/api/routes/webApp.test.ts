import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appContentSecurityPolicy, webApp } from "./webApp";

// A built web app in a temporary folder, and an API with two routes behind webApp, as index.ts
// wires them when WEB_DIR is set
let webDir: string;
let server: Server;
let base: string;

const start = (hsts: boolean) =>
    new Promise<{ server: Server; base: string }>((resolve) => {
        const app = express();
        app.use(webApp(webDir, { hsts }));
        app.get("/", (_req, res) => {
            res.json({ message: "Custoro API" });
        });
        app.get("/customers", (req, res) => {
            res.json({ route: "customers", query: req.query });
        });
        app.post("/login", (_req, res) => {
            res.json({ route: "login" });
        });
        const listening = app.listen(0, "127.0.0.1", () => {
            const { port } = listening.address() as AddressInfo;
            resolve({ server: listening, base: `http://127.0.0.1:${port}` });
        });
    });

beforeAll(async () => {
    webDir = fs.mkdtempSync(path.join(os.tmpdir(), "custoro-web-"));
    fs.mkdirSync(path.join(webDir, "assets"));
    fs.mkdirSync(path.join(webDir, "locales"));
    fs.writeFileSync(path.join(webDir, "index.html"), "<!doctype html><title>Custoro</title>");
    fs.writeFileSync(path.join(webDir, "assets", "index-abc123.js"), "console.log(1)");
    fs.writeFileSync(path.join(webDir, "locales", "en.json"), '{"hello":"Hello"}');
    fs.writeFileSync(path.join(webDir, ".env"), "SECRET=1");
    ({ server, base } = await start(true));
});

afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(webDir, { recursive: true, force: true });
});

describe("webApp", () => {
    it("passes /api/... to the API without the prefix, with the query", async () => {
        const answer = await fetch(`${base}/api/customers?page=2`);

        expect(await answer.json()).toEqual({ route: "customers", query: { page: "2" } });
        expect(answer.headers.get("content-security-policy")).toBeNull();
        expect(answer.headers.get("x-content-type-options")).toBe("nosniff");
        expect(answer.headers.get("strict-transport-security")).toBe("max-age=31536000");
    });

    it("answers GET /api/ with the API's root (the deploy script's health check)", async () => {
        const answer = await fetch(`${base}/api/`);

        expect(await answer.json()).toEqual({ message: "Custoro API" });
    });

    it("passes other methods under /api on as well", async () => {
        const answer = await fetch(`${base}/api/login`, { method: "POST" });

        expect(await answer.json()).toEqual({ route: "login" });
    });

    it("never lets an app path reach the API: /customers is the app's page", async () => {
        const answer = await fetch(`${base}/customers`);

        expect(answer.status).toBe(200);
        expect(await answer.text()).toContain("<title>Custoro</title>");
        expect(answer.headers.get("cache-control")).toBe("no-cache");
        expect(answer.headers.get("content-security-policy")).toBe(appContentSecurityPolicy);
        expect(answer.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    });

    it("serves the root as index.html, not the API's version answer", async () => {
        const answer = await fetch(`${base}/`);

        expect(await answer.text()).toContain("<title>Custoro</title>");
    });

    it("refuses writes outside /api", async () => {
        const answer = await fetch(`${base}/login`, { method: "POST" });

        expect(answer.status).toBe(405);
        expect(answer.headers.get("allow")).toBe("GET, HEAD");
    });

    it("caches fingerprinted assets for a year and 404s a missing one", async () => {
        const found = await fetch(`${base}/assets/index-abc123.js`);
        const missing = await fetch(`${base}/assets/index-gone.js`);

        expect(found.status).toBe(200);
        expect(found.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
        expect(found.headers.get("content-security-policy")).toBe(appContentSecurityPolicy);
        expect(missing.status).toBe(404);
    });

    it("serves the other build files to be checked each time", async () => {
        const answer = await fetch(`${base}/locales/en.json`);

        expect(await answer.json()).toEqual({ hello: "Hello" });
        expect(answer.headers.get("cache-control")).toBe("no-cache");
    });

    it("never serves dot files or files outside the build", async () => {
        const dotFile = await fetch(`${base}/.env`);
        const outside = await fetch(`${base}/%2e%2e/%2e%2e/etc/passwd`);

        expect(await dotFile.text()).not.toContain("SECRET");
        expect(await outside.text()).not.toContain("root:");
    });

    it("sends no HSTS when the app is not reached over HTTPS", async () => {
        const plain = await start(false);
        const answer = await fetch(`${plain.base}/`);
        await new Promise((resolve) => plain.server.close(resolve));

        expect(answer.headers.get("strict-transport-security")).toBeNull();
    });

    it("serves the app from an install under a dot folder (~/.apps/custoro)", async () => {
        const dotted = path.join(webDir, ".apps", "web");
        fs.mkdirSync(dotted, { recursive: true });
        fs.writeFileSync(path.join(dotted, "index.html"), "<title>Dotted</title>");
        const app = express();
        app.use(webApp(dotted, { hsts: false }));
        const listening = await new Promise<Server>((resolve) => {
            const started = app.listen(0, "127.0.0.1", () => resolve(started));
        });
        const { port } = listening.address() as AddressInfo;
        const answer = await fetch(`http://127.0.0.1:${port}/invoices/12`);
        const text = await answer.text();
        await new Promise((resolve) => listening.close(resolve));

        expect(answer.status).toBe(200);
        expect(text).toContain("Dotted");
    });

    it("refuses to start without a built app", () => {
        expect(() => webApp(path.join(webDir, "missing"), { hsts: true })).toThrow(/index\.html/);
    });

    // The API container mounts apps/api only, so this runs where the whole repository is
    const nginxHeaders = path.resolve(__dirname, "../../web/nginx/app-headers.conf");

    it.skipIf(!fs.existsSync(nginxHeaders))("has the same CSP as the nginx setup", () => {
        const conf = fs.readFileSync(nginxHeaders, "utf8");
        const csp = conf.match(/Content-Security-Policy "([^"]+)"/)?.[1];

        expect(csp).toBe(appContentSecurityPolicy);
    });
});
