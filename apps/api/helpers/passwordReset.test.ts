import { describe, expect, it, vi } from "vitest";
import { verifyPassword } from "./credentials";
import {
    checkResetToken,
    createResetToken,
    hashResetToken,
    isWellFormedResetToken,
    requestPasswordReset,
    resetPassword,
    resetTokenLifetimeMs,
    type RequestResetDepsIF,
    type ResetTokenIF
} from "./passwordReset";

const token = "a".repeat(64);
const tokenHash = hashResetToken(token);

describe("isWellFormedResetToken", () => {
    it("accepts 64 lowercase hex characters", () => {
        expect(isWellFormedResetToken(createResetToken().token)).toBe(true);
    });

    it.each([
        ["an empty string", ""],
        ["63 characters", "a".repeat(63)],
        ["65 characters", "a".repeat(65)],
        ["uppercase hex", "A".repeat(64)],
        ["non-hex characters", "g".repeat(64)],
        ["a SQL fragment", `${"a".repeat(60)}' OR`],
        ["a missing value", undefined],
        ["null", null],
        ["a number", 123]
    ])("rejects %s", (_case, value) => {
        expect(isWellFormedResetToken(value)).toBe(false);
    });
});

describe("createResetToken", () => {
    it("stores a hash, never the token itself", () => {
        const created = createResetToken();

        expect(created.tokenHash).toBe(hashResetToken(created.token));
        expect(created.tokenHash).not.toBe(created.token);
    });

    it("expires one hour from now", () => {
        const now = new Date("2026-10-09T12:00:00Z");

        expect(createResetToken(now).expiresAt.getTime() - now.getTime()).toBe(
            resetTokenLifetimeMs
        );
        expect(resetTokenLifetimeMs).toBe(60 * 60 * 1000);
    });

    it("creates a different token every time", () => {
        expect(createResetToken().token).not.toBe(createResetToken().token);
    });
});

describe("requestPasswordReset", () => {
    const fixedToken: ResetTokenIF = {
        token,
        tokenHash,
        expiresAt: new Date("2026-10-09T13:00:00Z")
    };

    const fakeDeps = (overrides: Partial<RequestResetDepsIF> = {}) => ({
        findUserId: vi.fn<RequestResetDepsIF["findUserId"]>(async () => 7),
        saveToken: vi.fn<RequestResetDepsIF["saveToken"]>(async () => true),
        sendEmail: vi.fn<RequestResetDepsIF["sendEmail"]>(async () => ({ success: true })),
        reportError: vi.fn<RequestResetDepsIF["reportError"]>(),
        createToken: () => fixedToken,
        ...overrides
    });

    it("saves the token hash and emails a link with the token", async () => {
        const deps = fakeDeps();

        await requestPasswordReset("user@example.test", "https://app.example.test", deps);

        expect(deps.saveToken).toHaveBeenCalledWith(7, tokenHash, fixedToken.expiresAt);
        expect(deps.sendEmail).toHaveBeenCalledWith(
            "user@example.test",
            `https://app.example.test/restore/${token}`
        );
        expect(deps.reportError).not.toHaveBeenCalled();
    });

    it("does nothing for an unknown address", async () => {
        const deps = fakeDeps({ findUserId: vi.fn(async () => null) });

        await requestPasswordReset("nobody@example.test", "https://app.example.test", deps);

        expect(deps.saveToken).not.toHaveBeenCalled();
        expect(deps.sendEmail).not.toHaveBeenCalled();
    });

    it("does nothing for an empty address", async () => {
        const deps = fakeDeps();

        await requestPasswordReset("", "https://app.example.test", deps);

        expect(deps.findUserId).not.toHaveBeenCalled();
    });

    it("reports a failed email instead of returning it", async () => {
        const deps = fakeDeps({
            sendEmail: vi.fn(async () => ({ success: false, message: "missingInfo" }))
        });

        await expect(
            requestPasswordReset("user@example.test", "https://app.example.test", deps)
        ).resolves.toBeUndefined();
        expect(deps.reportError).toHaveBeenCalledWith(expect.stringContaining("missingInfo"));
    });

    it("does not send an email when the token could not be saved", async () => {
        const deps = fakeDeps({ saveToken: vi.fn(async () => false) });

        await requestPasswordReset("user@example.test", "https://app.example.test", deps);

        expect(deps.sendEmail).not.toHaveBeenCalled();
        expect(deps.reportError).toHaveBeenCalled();
    });

    it("reports a thrown error and never rejects", async () => {
        const deps = fakeDeps({
            findUserId: vi.fn(async () => {
                throw new Error("database down");
            })
        });

        await expect(
            requestPasswordReset("user@example.test", "https://app.example.test", deps)
        ).resolves.toBeUndefined();
        expect(deps.reportError).toHaveBeenCalledWith(expect.stringContaining("database down"));
    });
});

describe("checkResetToken", () => {
    it("looks up the hash of a well-formed token", async () => {
        const findUserIdByTokenHash = vi.fn(async () => 7);

        expect(await checkResetToken(token, { findUserIdByTokenHash })).toBe(true);
        expect(findUserIdByTokenHash).toHaveBeenCalledWith(tokenHash);
    });

    it("rejects a token nobody has, or whose time ran out", async () => {
        expect(await checkResetToken(token, { findUserIdByTokenHash: async () => null })).toBe(
            false
        );
    });

    // The bug this fixes: finished resets left an empty token, which matched that user
    it.each([
        ["an empty token", ""],
        ["a missing token", undefined]
    ])("rejects %s without a database lookup", async (_case, value) => {
        const findUserIdByTokenHash = vi.fn(async () => 7);

        expect(await checkResetToken(value, { findUserIdByTokenHash })).toBe(false);
        expect(findUserIdByTokenHash).not.toHaveBeenCalled();
    });
});

describe("resetPassword", () => {
    it("sets the new password hash for the token's hash", async () => {
        const consumeToken = vi.fn(async () => true);

        expect(await resetPassword(token, "new-password", { consumeToken })).toEqual({
            success: true
        });

        const [hashArg, passwordHash] = consumeToken.mock.calls[0] as unknown as [string, string];

        expect(hashArg).toBe(tokenHash);
        expect(await verifyPassword("new-password", passwordHash)).toBe(true);
    });

    it("stores a password with quotes and & < > so that login accepts it", async () => {
        const consumeToken = vi.fn(async () => true);
        const password = 'Say "hi" & <go>';

        await resetPassword(token, password, { consumeToken });

        const passwordHash = (consumeToken.mock.calls[0] as unknown as [string, string])[1];

        expect(await verifyPassword(password, passwordHash)).toBe(true);
    });

    it.each([
        ["an empty token", ""],
        ["a missing token", undefined],
        ["a malformed token", "not-a-token"]
    ])("rejects %s without touching the database", async (_case, value) => {
        const consumeToken = vi.fn(async () => true);

        expect(await resetPassword(value, "new-password", { consumeToken })).toEqual({
            success: false,
            message: "noToken"
        });
        expect(consumeToken).not.toHaveBeenCalled();
    });

    it("rejects a token that was already used or has expired", async () => {
        expect(
            await resetPassword(token, "new-password", { consumeToken: async () => false })
        ).toEqual({ success: false, message: "noToken" });
    });

    it.each([
        ["too short", "short"],
        ["too long for bcrypt", "a".repeat(73)],
        ["missing", undefined]
    ])("rejects a password that is %s", async (_case, password) => {
        const consumeToken = vi.fn(async () => true);

        expect(await resetPassword(token, password, { consumeToken })).toEqual({
            success: false,
            message: "passwordLength"
        });
        expect(consumeToken).not.toHaveBeenCalled();
    });
});
