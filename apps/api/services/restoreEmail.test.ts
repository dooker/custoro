import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getPool: () => ({}) }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

const { defaultRestoreEmail, withRestoreLink } = await import("./profile");

describe("the password email", () => {
    it("is the default, with the link, for a company that has not written one", () => {
        expect(withRestoreLink({})).toEqual(defaultRestoreEmail);
        expect(withRestoreLink(undefined).text).toContain("[RESTORE_LINK]");
        expect(withRestoreLink({ subject: "", text: "", html: "" }).html).toContain(
            'href="[RESTORE_LINK]"'
        );
    });

    it("keeps each part the company wrote", () => {
        expect(
            withRestoreLink({ subject: "Your Acme password", text: "Here: [RESTORE_LINK]" })
        ).toEqual({
            subject: "Your Acme password",
            text: "Here: [RESTORE_LINK]",
            html: defaultRestoreEmail.html
        });
    });
});
