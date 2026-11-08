import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { pdfDir } from "../config/paths";

// Emailing an invoice: an invoice without a customer is refused instead of crashing, and the
// invoice records when it was sent, only once the mail server took the email.
const queryMock = vi.fn();
const emailMock = vi.fn();

vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("../helper/query", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../helper/query")>()),
    query: queryMock
}));
vi.mock("./_helpers", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./_helpers")>()),
    email: emailMock,
    getConfig: vi.fn(async () => ({
        success: true,
        data: { subject: "Invoice", text: "[INVOICE_LINK]", html: "[INVOICE_LINK]" }
    }))
}));

const { postSingle } = await import("./email");

const filename = "emailtest_1001.pdf";
const request = { database: "shop", body: { id: 7 } } as unknown as Request;
const customer = {
    name: "Õnne OÜ",
    email: "a@example.test",
    invoiceEmail: "",
    filename,
    hash: "h"
};

beforeAll(() => {
    fs.mkdirSync(pdfDir, { recursive: true });
    fs.writeFileSync(path.join(pdfDir, filename), "%PDF-1.7");
});

afterAll(() => {
    fs.rmSync(path.join(pdfDir, filename), { force: true });
});

beforeEach(() => {
    queryMock.mockReset();
    emailMock.mockReset();
    queryMock.mockImplementation(async ({ sql }: { sql: string }) =>
        /^\s*UPDATE/.test(sql)
            ? { success: true, data: {} }
            : { success: true, data: [{ ...customer }] }
    );
});

const updates = () =>
    queryMock.mock.calls.filter(([{ sql }]) => /UPDATE invoices/.test(sql)).map(([call]) => call);

describe("POST /email", () => {
    it("refuses an invoice without a customer and sends nothing", async () => {
        queryMock.mockResolvedValue({ success: true, data: [] });

        expect(await postSingle(request)).toEqual({ success: false, message: "get.customer" });
        expect(emailMock).not.toHaveBeenCalled();
    });

    it("records the sent date after the mail server took the email", async () => {
        emailMock.mockResolvedValue({ success: true });

        const result = await postSingle(request);

        expect(result).toEqual({ success: true, sentDate: expect.any(String) });
        expect(updates()).toHaveLength(1);
        expect(updates()[0].sql).toMatch(/SET sent_date = NOW\(\)/);
        expect(updates()[0].params).toEqual([7]);
    });

    it("records nothing when the email failed", async () => {
        emailMock.mockResolvedValue({ success: false, message: "email.transporter" });

        expect(await postSingle(request)).toEqual({
            success: false,
            message: "email.transporter"
        });
        expect(updates()).toHaveLength(0);
    });

    it("still reports the email as sent when only recording the date failed", async () => {
        emailMock.mockResolvedValue({ success: true });
        queryMock.mockImplementation(async ({ sql }: { sql: string }) =>
            /^\s*UPDATE/.test(sql)
                ? { success: false, message: "error" }
                : { success: true, data: [{ ...customer }] }
        );

        expect(await postSingle(request)).toEqual({ success: true, sentDate: null });
    });
});
