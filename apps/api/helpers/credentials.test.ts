import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    checkCredentials,
    createTokenSigner,
    hashPassword,
    resolveSession,
    verifyToken,
    isValidNewPassword,
    verifyPassword,
    loginFailedMessage,
    missingInfoMessage,
    type CredentialsDepsIF,
    type LoginUserIF
} from "./credentials";

const admin: LoginUserIF = { id: 1, password: "hash-of-admin", role: "admin", token_version: 3 };

const fakeDeps = (overrides: Partial<CredentialsDepsIF> = {}) => ({
    findUser: vi.fn<CredentialsDepsIF["findUser"]>(async () => ({ success: true, user: admin })),
    comparePassword: vi.fn<CredentialsDepsIF["comparePassword"]>(async () => true),
    signToken: vi.fn<CredentialsDepsIF["signToken"]>(() => "signed-token"),
    ...overrides
});

beforeEach(() => {
    // The failure paths log on purpose; keep the test output clean
    vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("checkCredentials", () => {
    it("returns a token for a known user with the right password", async () => {
        const deps = fakeDeps();

        const result = await checkCredentials("user@example.test", "correct-password", deps);

        expect(result).toEqual({ success: true, token: "signed-token" });
        expect(deps.findUser).toHaveBeenCalledWith("user@example.test");
        expect(deps.comparePassword).toHaveBeenCalledWith("correct-password", "hash-of-admin");
        expect(deps.signToken).toHaveBeenCalledWith({ id: 1, tv: 3 });
    });

    it.each([
        ["no username", undefined, "secret"],
        ["no password", "user@example.test", undefined],
        ["empty username", "", "secret"],
        ["empty password", "user@example.test", ""]
    ])("rejects %s without looking up a user", async (_case, username, password) => {
        const deps = fakeDeps();

        const result = await checkCredentials(username, password, deps);

        expect(result).toEqual({ success: false, message: missingInfoMessage });
        expect(deps.findUser).not.toHaveBeenCalled();
    });

    it("rejects an unknown user after the same bcrypt work as a known one", async () => {
        // comparePassword answers true here, so only the missing user can cause the rejection
        const deps = fakeDeps({ findUser: vi.fn(async () => ({ success: true })) });

        const result = await checkCredentials("nobody@example.test", "secret", deps);

        expect(result).toEqual({ success: false, message: loginFailedMessage });
        expect(deps.comparePassword).toHaveBeenCalledWith(
            "secret",
            expect.stringMatching(/^\$2[aby]\$10\$/)
        );
        expect(deps.signToken).not.toHaveBeenCalled();
    });

    it("rejects a user that has no password yet", async () => {
        const deps = fakeDeps({
            findUser: vi.fn(async () => ({ success: true, user: { ...admin, password: null } }))
        });

        const result = await checkCredentials("user@example.test", "secret", deps);

        expect(result).toEqual({ success: false, message: loginFailedMessage });
        expect(deps.signToken).not.toHaveBeenCalled();
    });

    it("rejects the login when the user lookup fails", async () => {
        const deps = fakeDeps({ findUser: vi.fn(async () => ({ success: false })) });

        const result = await checkCredentials("user@example.test", "secret", deps);

        expect(result).toEqual({ success: false, message: loginFailedMessage });
    });

    it("rejects a wrong password without issuing a token", async () => {
        const deps = fakeDeps({ comparePassword: vi.fn(async () => false) });

        const result = await checkCredentials("user@example.test", "wrong", deps);

        expect(result).toEqual({ success: false, message: loginFailedMessage });
        expect(deps.signToken).not.toHaveBeenCalled();
    });

    it("gives the same message for an unknown user and a wrong password", async () => {
        const unknown = await checkCredentials(
            "nobody@example.test",
            "secret",
            fakeDeps({ findUser: vi.fn(async () => ({ success: true })) })
        );
        const wrong = await checkCredentials(
            "user@example.test",
            "wrong",
            fakeDeps({ comparePassword: vi.fn(async () => false) })
        );

        expect(unknown).toEqual(wrong);
    });

    it("sanitizes the username before the lookup", async () => {
        const deps = fakeDeps();

        await checkCredentials("<b>user</b>@example.test", "secret", deps);

        expect(deps.findUser).toHaveBeenCalledWith("&lt;b&gt;user&lt;/b&gt;@example.test");
    });
});

describe("checkCredentials with real bcrypt", () => {
    const login = async (password: string, hash: string) =>
        checkCredentials("user@example.test", password, {
            findUser: async () => ({ success: true, user: { ...admin, password: hash } }),
            comparePassword: verifyPassword,
            signToken: () => "signed-token"
        });

    it("accepts the password the hash was made from", async () => {
        const hash = await hashPassword("correct-password");

        expect((await login("correct-password", hash)).success).toBe(true);
    });

    // Reset and profile hash the password as typed, so login must compare it as typed too.
    // It used to escape quotes and & < > first, which locked out such passwords.
    it("accepts a password with quotes and & < > that was hashed as typed", async () => {
        const password = 'Say "hi" & <go>';
        const hash = await hashPassword(password);

        expect((await login(password, hash)).success).toBe(true);
    });

    it("does not compare against an escaped form of the password", async () => {
        const hash = await bcrypt.hash('Say \\"hi\\"', 4);

        expect((await login('Say "hi"', hash)).success).toBe(false);
    });
});

describe("isValidNewPassword", () => {
    it.each([
        ["8 characters", "12345678"],
        ["quotes and angle brackets", 'Say "hi" & <go>'],
        ["72 one-byte characters", "a".repeat(72)],
        ["36 two-byte characters", "ä".repeat(36)]
    ])("accepts %s", (_case, password) => {
        expect(isValidNewPassword(password)).toBe(true);
    });

    it.each([
        ["7 characters", "1234567"],
        ["an empty string", ""],
        ["73 bytes, which bcrypt would cut", "a".repeat(73)],
        ["37 two-byte characters", "ä".repeat(37)],
        ["a number", 12345678],
        ["a missing value", undefined]
    ])("rejects %s", (_case, password) => {
        expect(isValidNewPassword(password)).toBe(false);
    });
});

describe("createTokenSigner", () => {
    it("uses the configured lifetime", () => {
        const token = createTokenSigner("test-secret", "2h")({ id: 2, tv: 0 });
        const decoded = jwt.verify(token, "test-secret") as jwt.JwtPayload;

        expect(decoded.exp! - decoded.iat!).toBe(2 * 60 * 60);
    });

    it("signs the id and token version with HS256 and a 24 hour default lifetime", () => {
        const token = createTokenSigner("test-secret")({ id: 2, tv: 5 });
        const decoded = jwt.verify(token, "test-secret", { complete: true });
        const payload = decoded.payload as jwt.JwtPayload;

        expect(decoded.header.alg).toBe("HS256");
        expect(payload).toMatchObject({ id: 2, tv: 5 });
        expect(payload).not.toHaveProperty("role");
        expect(payload.exp! - payload.iat!).toBe(24 * 60 * 60);
    });

    it("produces a token that fails verification with another secret", () => {
        const token = createTokenSigner("test-secret")({ id: 2, tv: 0 });

        expect(() => verifyToken(token, "other-secret")).toThrow();
    });
});

describe("verifyToken", () => {
    it("accepts a token from createTokenSigner", () => {
        const token = createTokenSigner("test-secret")({ id: 2, tv: 0 });

        expect(verifyToken(token, "test-secret")).toMatchObject({ id: 2, tv: 0 });
    });

    it("refuses an unsigned token", () => {
        const unsigned = jwt.sign({ id: 1, tv: 0 }, null, { algorithm: "none" });

        expect(() => verifyToken(unsigned, "test-secret")).toThrow();
    });

    it("refuses a token signed with another HMAC algorithm", () => {
        const token = jwt.sign({ id: 1, tv: 0 }, "test-secret", { algorithm: "HS512" });

        expect(() => verifyToken(token, "test-secret")).toThrow();
    });
});

describe("resolveSession", () => {
    const user = { id: 2, role: "user", token_version: 4 };

    it("returns the caller with the role from the database", async () => {
        const findUser = vi.fn(async () => ({ ...user, role: "admin" }));

        expect(await resolveSession({ id: 2, tv: 4, role: "user" }, findUser)).toEqual({
            id: 2,
            role: "admin",
            tv: 4
        });
        expect(findUser).toHaveBeenCalledWith(2);
    });

    it("refuses a token from before the last password or email change", async () => {
        expect(await resolveSession({ id: 2, tv: 3 }, async () => user)).toBeNull();
    });

    it("refuses a token for a deleted user", async () => {
        expect(await resolveSession({ id: 2, tv: 4 }, async () => null)).toBeNull();
    });

    it.each([
        ["a string payload", "2"],
        ["a missing version (a token from before versions existed)", { id: 2, role: "admin" }],
        ["a string id", { id: "2", tv: 4 }],
        ["no payload", null]
    ])("refuses %s without a lookup", async (_case, payload) => {
        const findUser = vi.fn(async () => user);

        expect(await resolveSession(payload, findUser)).toBeNull();
        expect(findUser).not.toHaveBeenCalled();
    });
});
