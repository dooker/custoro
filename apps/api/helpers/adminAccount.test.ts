import { describe, expect, it } from "vitest";
import { defaultAdminName, parseAdminArgs, parseTenantArgs } from "./adminAccount";

const ok = (email: string, name = defaultAdminName, reset = false, tenantId = 1) => ({
    ok: true,
    args: { email, name, reset, tenantId }
});

describe("parseAdminArgs", () => {
    it("takes the email and names the admin Admin by default", () => {
        expect(parseAdminArgs(["boss@example.test"])).toEqual(ok("boss@example.test"));
    });

    it("takes the company of a new admin, company 1 by default", () => {
        expect(parseAdminArgs(["boss@example.test", "--tenant", "3"])).toEqual(
            ok("boss@example.test", defaultAdminName, false, 3)
        );
        expect(parseAdminArgs(["--tenant=12", "boss@example.test"])).toEqual(
            ok("boss@example.test", defaultAdminName, false, 12)
        );
    });

    it.each([["0"], ["-1"], ["two"], ["1.5"], [""]])("refuses --tenant %s", (value) => {
        expect(parseAdminArgs(["boss@example.test", "--tenant", value])).toEqual({
            ok: false,
            error: "--tenant needs a company id (a whole number)"
        });
    });

    it("takes a name, with a space or an equals sign, and the reset flag", () => {
        expect(parseAdminArgs(["boss@example.test", "--name", "Ann Boss"])).toEqual(
            ok("boss@example.test", "Ann Boss")
        );
        expect(parseAdminArgs(["--name=Ann Boss", "--reset", "boss@example.test"])).toEqual(
            ok("boss@example.test", "Ann Boss", true)
        );
    });

    it("trims the email and the name", () => {
        expect(parseAdminArgs([" boss@example.test ", "--name", "  Ann  "])).toEqual(
            ok("boss@example.test", "Ann")
        );
    });

    it("needs an email that looks like one", () => {
        expect(parseAdminArgs([])).toMatchObject({ ok: false });
        expect(parseAdminArgs(["boss"])).toMatchObject({ ok: false });
        expect(parseAdminArgs(["boss@example"])).toMatchObject({ ok: false });
        expect(parseAdminArgs([`${"a".repeat(250)}@example.test`])).toMatchObject({ ok: false });
    });

    it("refuses what it does not know, so a password given as an argument is not ignored", () => {
        expect(parseAdminArgs(["boss@example.test", "--password", "secret"])).toEqual({
            ok: false,
            error: "Unknown option --password"
        });
        expect(parseAdminArgs(["boss@example.test", "secret"])).toEqual({
            ok: false,
            error: "Unexpected argument secret"
        });
    });

    it("refuses an empty name and a name longer than the column", () => {
        expect(parseAdminArgs(["boss@example.test", "--name"])).toMatchObject({ ok: false });
        expect(parseAdminArgs(["boss@example.test", "--name", "  "])).toMatchObject({ ok: false });
        expect(parseAdminArgs(["boss@example.test", "--name", "x".repeat(101)])).toMatchObject({
            ok: false
        });
    });
});

describe("parseTenantArgs", () => {
    it("takes the company name, the admin's email and name", () => {
        expect(
            parseTenantArgs([
                "East Side Customs OÜ",
                "--admin",
                "boss@example.test",
                "--admin-name=Ann"
            ])
        ).toEqual({
            ok: true,
            args: {
                name: "East Side Customs OÜ",
                adminEmail: "boss@example.test",
                adminName: "Ann"
            }
        });
        expect(parseTenantArgs(["--admin=boss@example.test", "Acme"])).toEqual({
            ok: true,
            args: { name: "Acme", adminEmail: "boss@example.test", adminName: defaultAdminName }
        });
    });

    it.each([
        [["Acme"], /--admin/],
        [["--admin", "boss@example.test"], /company name/],
        [["Acme", "--admin", "not-an-email"], /--admin/],
        [["Acme", "Corp", "--admin", "boss@example.test"], /quotes/],
        [["Acme", "--admin", "boss@example.test", "--owner"], /Unknown option/]
    ])("refuses %j", (argv, error) => {
        const parsed = parseTenantArgs(argv);

        expect(parsed.ok).toBe(false);
        expect(parsed.ok ? "" : parsed.error).toMatch(error);
    });
});
