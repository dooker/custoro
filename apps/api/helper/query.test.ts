import { afterEach, describe, expect, it, vi } from "vitest";

// query.ts opens database pools through ../db; the tests hand it a fake pool instead
const poolQuery = vi.fn();

vi.mock("../db", () => ({ getPool: () => ({ query: poolQuery }) }));
vi.mock("@sentry/node", () => ({
    captureMessage: vi.fn(),
    captureException: vi.fn(),
    withScope: (callback: (scope: object) => void) =>
        callback({ setTag: vi.fn(), setExtras: vi.fn() })
}));

const { query, redactParams, scrubSqlMessage } = await import("./query");
const Sentry = await import("@sentry/node");

afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

describe("redactParams", () => {
    it("hides strings, which can be emails, password hashes or token hashes", () => {
        const hash = "$2b$10$1h1wg1EUImM/JETqPmL/GuRstFFsJplJShlJCi1yQ1hf6ETgxCLeC";

        const redacted = redactParams(["admin@example.test", hash]);

        expect(JSON.stringify(redacted)).not.toContain("admin@example.test");
        expect(JSON.stringify(redacted)).not.toContain(hash);
        expect(redacted).toEqual(["[string, 18 chars]", "[string, 60 chars]"]);
    });

    it("keeps numbers, booleans and empty values, which are ids and flags", () => {
        expect(redactParams([42, true, null, undefined])).toEqual([42, true, null, undefined]);
    });

    it("hides objects, arrays and dates", () => {
        expect(redactParams([{ a: "secret" }, ["secret"], new Date()])).toEqual([
            "[object]",
            "[array]",
            "[date]"
        ]);
    });
});

describe("scrubSqlMessage", () => {
    it("removes quoted values from a MySQL error text", () => {
        expect(
            scrubSqlMessage("Duplicate entry 'ann@example.test' for key 'users.username_UNIQUE'")
        ).toBe("Duplicate entry '?' for key '?'");
    });

    it("handles escaped quotes inside a value", () => {
        expect(scrubSqlMessage("Incorrect value: 'it\\'s secret' here")).toBe(
            "Incorrect value: '?' here"
        );
    });

    it("keeps a text without values", () => {
        expect(scrubSqlMessage("Unknown column `x` in field list")).toBe(
            "Unknown column `x` in field list"
        );
    });
});

describe("query on failure", () => {
    const duplicate = Object.assign(new Error("dup"), {
        code: "ER_DUP_ENTRY",
        sqlMessage: "Duplicate entry 'ann@example.test' for key 'users.username_UNIQUE'"
    });

    it("returns the generic key and the MySQL code, never the error text", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        poolQuery.mockRejectedValueOnce(duplicate);

        const result = await query({
            database: "test",
            sql: "UPDATE users SET username = ?",
            params: ["ann@example.test"]
        });

        expect(result).toEqual({
            success: false,
            data: [],
            code: "ER_DUP_ENTRY",
            message: "error"
        });
    });

    it("sends Sentry the error without the quoted values", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        poolQuery.mockRejectedValueOnce(duplicate);

        await query({
            database: "test",
            sql: "UPDATE users SET username = ?",
            params: ["ann@example.test"]
        });

        const sent = JSON.stringify(vi.mocked(Sentry.captureException).mock.calls[0][0].message);

        expect(sent).not.toContain("ann@example.test");
    });

    it("hides connection errors too, which name the database host", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        poolQuery.mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.5:3306"));

        const result = await query({ database: "test", sql: "SELECT 1" });

        expect(result).toEqual({ success: false, data: [], message: "error" });
    });
});
