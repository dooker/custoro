import { describe, expect, it } from "vitest";
import { defaultAdminName, parseAdminArgs } from "./adminAccount";

const ok = (email: string, name = defaultAdminName, reset = false) => ({
    ok: true,
    args: { email, name, reset }
});

describe("parseAdminArgs", () => {
    it("takes the email and names the admin Admin by default", () => {
        expect(parseAdminArgs(["boss@example.test"])).toEqual(ok("boss@example.test"));
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
