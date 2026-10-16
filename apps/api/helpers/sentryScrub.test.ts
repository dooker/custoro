import { describe, expect, it } from "vitest";
import { scrubSentryEvent, tracesSampleRate } from "./sentryScrub";

const hash = "902826ad2a84a293a1fe8b480cb0b8db";

describe("scrubSentryEvent", () => {
    it("removes request bodies, cookies and the Authorization header", () => {
        const event = scrubSentryEvent({
            request: {
                data: { username: "a@example.test", password: "secret" },
                cookies: { session: "x" },
                headers: {
                    authorization: "Bearer a.b.c",
                    Authorization: "Bearer a.b.c",
                    accept: "*/*"
                }
            }
        });

        expect(event.request).toEqual({ headers: { accept: "*/*" } });
    });

    it("hides the PDF hash in an error's request URL", () => {
        const event = scrubSentryEvent({
            request: { url: `https://app.example.test/pdf/${hash}` },
            message: `ERR_INVALID_CHAR while sending /pdf/${hash}`
        });

        expect(event.request?.url).toBe("https://app.example.test/pdf/[hash]");
        expect((event as { message: string }).message).toBe(
            "ERR_INVALID_CHAR while sending /pdf/[hash]"
        );
    });

    it("hides the PDF hash everywhere in a transaction: name, spans, data and breadcrumbs", () => {
        const event = scrubSentryEvent({
            transaction: `GET /pdf/${hash}`,
            request: { url: `http://api:3999/pdf/${hash}?download=1` },
            contexts: {
                trace: {
                    data: { "http.target": `/pdf/${hash}`, "url.full": `http://x/pdf/${hash}` }
                }
            },
            spans: [
                { description: `GET /pdf/${hash}`, data: { "http.url": `http://x/pdf/${hash}` } },
                { description: "SELECT filename FROM invoices" }
            ],
            breadcrumbs: [{ category: "http", data: { url: `/pdf/${hash.toUpperCase()}` } }]
        });

        expect(JSON.stringify(event)).not.toMatch(/[0-9a-f]{32}/i);
        expect(event.transaction).toBe("GET /pdf/[hash]");
        expect(event.request?.url).toBe("http://api:3999/pdf/[hash]?download=1");
        expect(event.spans[1].description).toBe("SELECT filename FROM invoices");
    });

    it("leaves other text and the route pattern alone", () => {
        const event = scrubSentryEvent({
            transaction: "GET /pdf/:hash",
            message: "GET /invoice/5 and an id 902826ad2a84a293a1fe8b480cb0b8db in the open"
        });

        expect(event.transaction).toBe("GET /pdf/:hash");
        expect(event.message).toBe(
            "GET /invoice/5 and an id 902826ad2a84a293a1fe8b480cb0b8db in the open"
        );
    });

    it("copes with circular data and very deep data", () => {
        const circular: Record<string, unknown> = { url: `/pdf/${hash}` };
        circular.self = circular;
        let deep: Record<string, unknown> = { url: `/pdf/${hash}` };

        for (let i = 0; i < 50; i++) deep = { next: deep };

        const event = scrubSentryEvent({ extra: { circular, deep } });

        expect((event.extra.circular as { url: string }).url).toBe("/pdf/[hash]");
    });
});

describe("tracesSampleRate", () => {
    it("keeps everything in development and a tenth in production", () => {
        expect(tracesSampleRate("development")).toBe(1);
        expect(tracesSampleRate("production")).toBe(0.1);
    });

    it("takes a rate from the environment when it is between 0 and 1", () => {
        expect(tracesSampleRate("production", "0.5")).toBe(0.5);
        expect(tracesSampleRate("production", "0")).toBe(0);
        expect(tracesSampleRate("development", "0.25")).toBe(0.25);
    });

    it("ignores a rate that is not a number from 0 to 1", () => {
        for (const value of ["", " ", "abc", "-0.1", "1.5", "NaN"]) {
            expect(tracesSampleRate("production", value), value).toBe(0.1);
        }
    });
});
