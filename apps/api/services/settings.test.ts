import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";

// The invoice counter cannot be set below a number that an invoice already has: the next invoice
// would get a number that is taken, and every invoice after it too
const queryMock = vi.fn();
const deleteImageFile = vi.fn();

vi.mock("../db", () => ({ getPool: () => ({}) }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("../helper/query", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../helper/query")>()),
    query: queryMock
}));
vi.mock("./_helpers", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./_helpers")>()),
    deleteImageFile
}));

const { putAll } = await import("./settings");

const request = (body: object, file?: object) =>
    ({ database: "shop", params: {}, query: {}, body, file }) as unknown as Request;

// The highest invoice number is 41
const databaseHas = (highest: string | null) =>
    queryMock.mockImplementation(async ({ sql }: { sql: string }) => {
        if (/MAX\(number_sort\)/.test(sql)) {
            return highest === null
                ? { success: false, data: [] }
                : { success: true, data: [{ highest }] };
        }

        return { success: true, data: [{ value: "" }] };
    });

const updates = () =>
    queryMock.mock.calls.map(([call]) => call).filter(({ sql }) => /UPDATE config/.test(sql));

beforeEach(() => {
    queryMock.mockReset();
    deleteImageFile.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("PUT /settings with lastInvoiceId", () => {
    it("refuses a counter below the highest number used, with its own message, and saves nothing", async () => {
        databaseHas("41");

        expect(await putAll(request({ lastInvoiceId: "36", companyName: "Acme" }))).toEqual({
            success: false,
            message: "lastInvoiceIdTooLow"
        });
        expect(updates()).toHaveLength(0);
    });

    it("removes the logo that came with a refused request", async () => {
        databaseHas("41");

        await putAll(request({ lastInvoiceId: "36" }, { filename: "logo-1.png" }));

        expect(deleteImageFile).toHaveBeenCalledWith("logo-1.png");
    });

    it("takes a counter at or above the highest number used", async () => {
        databaseHas("41");

        for (const value of ["41", "42", "1000"]) {
            queryMock.mockClear();
            databaseHas("41");

            expect(await putAll(request({ lastInvoiceId: value })), value).toMatchObject({
                success: true
            });
            expect(updates()[0].params).toContain(value);
        }
    });

    it("takes any counter when there are no invoices", async () => {
        databaseHas("0");

        expect(await putAll(request({ lastInvoiceId: "0" }))).toMatchObject({ success: true });
    });

    it("does not look at the invoices when the counter is not part of the request", async () => {
        databaseHas("41");

        expect(await putAll(request({ companyName: "Acme" }))).toMatchObject({ success: true });
        expect(queryMock.mock.calls.some(([{ sql }]) => /MAX\(number_sort\)/.test(sql))).toBe(
            false
        );
    });

    it("saves nothing when the highest number cannot be read", async () => {
        databaseHas(null);

        expect(await putAll(request({ lastInvoiceId: "50" }))).toEqual({
            success: false,
            message: "get.lastInvoiceId"
        });
        expect(updates()).toHaveLength(0);
    });

    it("still refuses a counter that is not a number first", async () => {
        databaseHas("41");

        expect(await putAll(request({ lastInvoiceId: "abc" }))).toEqual({
            success: false,
            message: "settingsInvalid"
        });
        expect(queryMock).not.toHaveBeenCalled();
    });
});
