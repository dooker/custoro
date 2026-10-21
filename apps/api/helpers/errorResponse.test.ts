import type { AddressInfo } from "node:net";
import { STATUS_CODES, type Server } from "node:http";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clientErrorStatus, error500, errorHandler } from "./errorResponse";

describe("clientErrorStatus", () => {
    it("gives the 4xx status of an error that carries one", () => {
        expect(clientErrorStatus(Object.assign(new Error("x"), { status: 413 }))).toBe(413);
        expect(clientErrorStatus(Object.assign(new Error("x"), { statusCode: 400 }))).toBe(400);
        expect(clientErrorStatus({ status: 404 })).toBe(404);
        expect(clientErrorStatus({ status: 499 })).toBe(499);
    });

    it("gives nothing for a server error, an odd status or an error without one", () => {
        for (const error of [
            Object.assign(new Error("x"), { status: 500 }),
            { status: 502 },
            { status: 399 },
            { status: 200 },
            { status: 400.5 },
            { status: "400" },
            { status: Number.NaN },
            new Error("x"),
            new TypeError("Cannot read properties of undefined"),
            Object.assign(new Error("db"), { code: "ER_DUP_ENTRY" }),
            "boom",
            null,
            undefined
        ]) {
            expect(clientErrorStatus(error), String(error)).toBeUndefined();
        }
    });
});

describe("errorHandler", () => {
    let server: Server;
    let base: string;

    beforeAll(async () => {
        const app = express();

        // What index.ts does, with the same default body limit (100 KB)
        app.use(express.json());
        app.post("/echo", (req, res) => {
            res.json({ received: req.body });
        });
        app.get("/boom", () => {
            throw new Error("secret table name");
        });
        app.get("/status/:code", (req, _res, next) => {
            next(
                Object.assign(new Error("thrown with a status"), {
                    status: Number(req.params.code)
                })
            );
        });
        app.use(errorHandler);

        await new Promise<void>((resolve) => {
            server = app.listen(0, "127.0.0.1", resolve);
        });
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(() => new Promise((resolve) => server.close(resolve)));

    beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    const post = (body: string) =>
        fetch(`${base}/echo`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body
        });

    it("answers a body over 100 KB with 413", async () => {
        const response = await post(JSON.stringify({ text: "x".repeat(150 * 1024) }));

        expect(response.status).toBe(413);
        expect(await response.json()).toEqual({ success: false, message: STATUS_CODES[413] });
    });

    it("answers malformed JSON with 400, without quoting the body", async () => {
        const response = await post('{"password": hunter2}');
        const text = await response.text();

        expect(response.status).toBe(400);
        expect(JSON.parse(text)).toEqual({ success: false, message: STATUS_CODES[400] });
        expect(text).not.toContain("hunter2");
    });

    it("still answers a body that is fine", async () => {
        const response = await post('{"a":1}');

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ received: { a: 1 } });
    });

    it("answers any other error with 500 and a text that says nothing about it", async () => {
        const response = await fetch(`${base}/boom`);
        const text = await response.text();

        expect(response.status).toBe(500);
        expect(JSON.parse(text)).toEqual({ message: error500 });
        expect(text).not.toContain("secret");
    });

    it("takes a 4xx status from an error, but a 5xx one is still a 500", async () => {
        expect((await fetch(`${base}/status/404`)).status).toBe(404);
        expect((await fetch(`${base}/status/429`)).status).toBe(429);
        expect((await fetch(`${base}/status/502`)).status).toBe(500);
    });

    it("leaves a response that is already on its way to Express", () => {
        const next = vi.fn();
        const error = new Error("late");
        const res = { headersSent: true, status: vi.fn() } as unknown as Response;

        errorHandler(error, {} as Request, res, next as NextFunction);

        expect(next).toHaveBeenCalledWith(error);
        expect(res.status).not.toHaveBeenCalled();
    });
});
