// Forgot-password and reset rules without Express or the database, so they can be unit tested.
// services/profile.ts supplies the real queries, email and error reporting.
import crypto from "crypto";
import { hashPassword, isValidNewPassword } from "./credentials";

export const resetTokenLifetimeMs = 60 * 60 * 1000;

// Tokens are 32 random bytes as hex. Anything else, including an empty string, is rejected
// before it reaches the database.
const resetTokenPattern = /^[0-9a-f]{64}$/;

export const isWellFormedResetToken = (token: unknown): token is string =>
    typeof token === "string" && resetTokenPattern.test(token);

// Only a hash of the token is stored, so a leaked database holds no working reset links
export const hashResetToken = (token: string): string =>
    crypto.createHash("sha256").update(token).digest("hex");

export interface ResetTokenIF {
    token: string;
    tokenHash: string;
    expiresAt: Date;
}

export const createResetToken = (now: Date = new Date()): ResetTokenIF => {
    const token = crypto.randomBytes(32).toString("hex");

    return {
        token,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(now.getTime() + resetTokenLifetimeMs)
    };
};

export interface RequestResetDepsIF {
    findUserId: (username: string) => Promise<number | null>;
    saveToken: (userId: number, tokenHash: string, expiresAt: Date) => Promise<boolean>;
    sendEmail: (to: string, link: string) => Promise<{ success: boolean; message?: string }>;
    reportError: (message: string) => void;
    createToken?: () => ResetTokenIF;
}

// Never tells the caller whether the address has an account: the route answers with success
// before this runs, and every failure is only reported to the server log.
export const requestPasswordReset = async (
    username: string,
    appOrigin: string,
    deps: RequestResetDepsIF
): Promise<void> => {
    try {
        if (!username) return;

        const userId = await deps.findUserId(username);

        if (!userId) return;

        const { token, tokenHash, expiresAt } = (deps.createToken ?? createResetToken)();

        if (!(await deps.saveToken(userId, tokenHash, expiresAt))) {
            deps.reportError("Password reset: saving the token failed");
            return;
        }

        const sent = await deps.sendEmail(username, `${appOrigin}/restore/${token}`);

        if (!sent.success) {
            deps.reportError(`Password reset: sending the email failed (${sent.message})`);
        }
    } catch (error) {
        deps.reportError(`Password reset: ${error instanceof Error ? error.message : error}`);
    }
};

export interface CheckResetTokenDepsIF {
    // Must only match a token that has not expired
    findUserIdByTokenHash: (tokenHash: string) => Promise<number | null>;
}

export const checkResetToken = async (
    token: unknown,
    deps: CheckResetTokenDepsIF
): Promise<boolean> => {
    if (!isWellFormedResetToken(token)) return false;

    return !!(await deps.findUserIdByTokenHash(hashResetToken(token)));
};

export interface ResetPasswordDepsIF {
    // Sets the password and clears the token in one update, only for a token that has not
    // expired, so a token works once. Returns whether a user was updated.
    consumeToken: (tokenHash: string, passwordHash: string) => Promise<boolean>;
}

export type ResetPasswordResultIF =
    { success: true } | { success: false; message: "noToken" | "passwordLength" };

export const resetPassword = async (
    token: unknown,
    password: unknown,
    deps: ResetPasswordDepsIF
): Promise<ResetPasswordResultIF> => {
    if (!isWellFormedResetToken(token)) {
        return { success: false, message: "noToken" };
    }

    if (!isValidNewPassword(password)) {
        return { success: false, message: "passwordLength" };
    }

    const consumed = await deps.consumeToken(hashResetToken(token), await hashPassword(password));

    return consumed ? { success: true } : { success: false, message: "noToken" };
};
