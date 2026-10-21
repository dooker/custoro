import { beforeEach, describe, expect, it, vi } from "vitest";

const createPool = vi.fn(() => ({}));

vi.mock("mysql2/promise", () => ({ default: { createPool } }));

const { getPool } = await import("./db");

beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("getPool", () => {
    it("limits how long a connection takes and how many requests wait for one", () => {
        getPool("shop");

        const [options] = createPool.mock.calls[0] as unknown as [Record<string, unknown>];

        expect(options).toMatchObject({
            database: "shop",
            waitForConnections: true,
            connectionLimit: 10,
            connectTimeout: 10000,
            enableKeepAlive: true
        });
        // 0 would let any number of requests wait
        expect(options.queueLimit).toBeGreaterThan(0);
        expect(options.queueLimit).toBeLessThan(Infinity);
    });

    it("opens one pool per database", () => {
        const first = getPool("one");

        expect(getPool("one")).toBe(first);
        expect(() => getPool("")).toThrow("Database name is required");
    });
});
