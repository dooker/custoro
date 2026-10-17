import { describe, expect, it } from "vitest";
import { mailPort, mailTransportOptions } from "./mailTransport";

const server = { host: "smtp.example.com", port: "587", username: "mailer", password: "secret" };

describe("mailPort", () => {
    it("reads the port, and falls back to 587 when it is missing or not a number", () => {
        expect(mailPort("2525")).toBe(2525);
        expect(mailPort(undefined)).toBe(587);
        expect(mailPort("")).toBe(587);
        expect(mailPort("abc")).toBe(587);
    });
});

describe("mailTransportOptions", () => {
    it("requires the STARTTLS upgrade on the submission port, so the login is never sent in plain text", () => {
        expect(mailTransportOptions(server)).toMatchObject({
            host: "smtp.example.com",
            port: 587,
            secure: false,
            requireTLS: true,
            auth: { user: "mailer", pass: "secret" }
        });
    });

    it("requires it on any other port and when the port is missing", () => {
        expect(mailTransportOptions({ ...server, port: "25" }).requireTLS).toBe(true);
        expect(mailTransportOptions({ ...server, port: undefined })).toMatchObject({
            port: 587,
            requireTLS: true
        });
    });

    it("uses TLS from the first byte on port 465", () => {
        expect(mailTransportOptions({ ...server, port: "465" })).toMatchObject({
            port: 465,
            secure: true,
            requireTLS: false
        });
    });

    it("allows a plain connection only when EMAIL_REQUIRE_TLS is the word false", () => {
        expect(mailTransportOptions(server, "false").requireTLS).toBe(false);
        expect(mailTransportOptions(server, " False ").requireTLS).toBe(false);

        for (const setting of [undefined, "", "true", "0", "no", "off"]) {
            expect(mailTransportOptions(server, setting).requireTLS).toBe(true);
        }
    });

    it("never turns off the check of the server certificate", () => {
        const options = mailTransportOptions(server, "false") as Record<string, unknown>;

        expect(options).not.toHaveProperty("tls");
        expect(options).not.toHaveProperty("ignoreTLS");
    });
});
