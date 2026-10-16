import { describe, expect, it } from "vitest";
import { parseSettingsInput, settingsInvalidMessage } from "./settingsInput";

const invalid = { success: false, message: settingsInvalidMessage };

describe("parseSettingsInput", () => {
    it("sorts the settings into short, long and mail server values", () => {
        const result = parseSettingsInput({
            vat: "24",
            companyName: "Quantum Desk",
            forgotHtml: "<p>[RESTORE_LINK]</p>",
            host: "smtp.example.test",
            port: "587"
        });

        expect(result).toEqual({
            success: true,
            input: {
                short: [
                    ["vat", "24"],
                    ["companyName", "Quantum Desk"]
                ],
                long: [["forgotHtml", "<p>[RESTORE_LINK]</p>"]],
                mail: { host: "smtp.example.test", port: "587" }
            }
        });
    });

    it("accepts the logo field the web form sends back, and ignores it", () => {
        expect(parseSettingsInput({ logo: "1700000000-abc.png", vat: "24" })).toEqual({
            success: true,
            input: { short: [["vat", "24"]], long: [], mail: {} }
        });
    });

    it("accepts an empty body", () => {
        expect(parseSettingsInput({})).toEqual({
            success: true,
            input: { short: [], long: [], mail: {} }
        });
    });

    it("refuses a key that is not a setting, even next to valid ones", () => {
        for (const key of [
            "id",
            "name",
            "role",
            "JWT_SECRET",
            "__proto__",
            "constructor",
            "toString"
        ]) {
            expect(parseSettingsInput({ vat: "24", [key]: "x" }), key).toEqual(invalid);
        }
    });

    it("refuses values that are not text or a number", () => {
        for (const value of [null, true, ["24"], { a: 1 }, Infinity, NaN]) {
            expect(parseSettingsInput({ companyName: value })).toEqual(invalid);
        }
    });

    it("refuses a body that is not an object", () => {
        for (const body of [undefined, null, "vat=24", ["vat"], 24]) {
            expect(parseSettingsInput(body)).toEqual(invalid);
        }
    });

    it("takes numbers from a JSON client as text", () => {
        expect(parseSettingsInput({ lastInvoiceId: 25003 })).toMatchObject({
            input: { short: [["lastInvoiceId", "25003"]] }
        });
    });

    it("accepts only a whole number as the last invoice id", () => {
        expect(parseSettingsInput({ lastInvoiceId: "0" }).success).toBe(true);
        expect(parseSettingsInput({ lastInvoiceId: "25003" }).success).toBe(true);

        for (const value of ["", "-1", "1.5", "abc", "1e3", " 5", "1234567890"]) {
            expect(parseSettingsInput({ lastInvoiceId: value }), value).toEqual(invalid);
        }
    });

    it("accepts only a percentage from 0 to 100 as the VAT rate", () => {
        for (const value of ["0", "24", "25.5", "9.99", "100"]) {
            expect(parseSettingsInput({ vat: value }).success, value).toBe(true);
        }

        for (const value of ["", "-1", "101", "24%", "24,5", "abc", "1e2", "24.123"]) {
            expect(parseSettingsInput({ vat: value }), value).toEqual(invalid);
        }
    });

    it("keeps the mail port a port number, and lets it be empty", () => {
        for (const value of ["", "25", "587", "65535"]) {
            expect(parseSettingsInput({ port: value }).success, value).toBe(true);
        }

        for (const value of ["65536", "-1", "smtp", "58 7"]) {
            expect(parseSettingsInput({ port: value }), value).toEqual(invalid);
        }
    });

    it("refuses short values that do not fit their column", () => {
        expect(parseSettingsInput({ companyName: "x".repeat(250) }).success).toBe(true);
        expect(parseSettingsInput({ companyName: "x".repeat(251) })).toEqual(invalid);
        // Long values (email texts) have no such limit
        expect(parseSettingsInput({ forgotHtml: "x".repeat(100_000) }).success).toBe(true);
    });
});
