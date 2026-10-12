// Login and password rules without Express or the database, so they can be unit tested.
// services/login.ts and services/profile.ts supply the real user lookup, bcrypt and JWT.
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { sanitize } from "../helper";

export interface LoginUserIF {
    id: number;
    password: string | null;
    role: string;
    token_version: number;
}

// What a login token carries. The role is not in it: it is read from the database on every
// request, so a role change applies at once. "tv" is users.token_version, raised whenever the
// password or email changes, which ends every older session.
export interface TokenPayloadIF {
    id: number;
    tv: number;
}

export interface CredentialsDepsIF {
    findUser: (username: string) => Promise<{ success: boolean; user?: LoginUserIF }>;
    comparePassword: (password: string, hash: string) => Promise<boolean>;
    signToken: (payload: TokenPayloadIF) => string;
}

export type LoginResultIF = { success: true; token: string } | { success: false; message: string };

export const missingInfoMessage = "Cannot login, missing vital info";
export const loginFailedMessage = "None shall pass!";

const saltRounds = 10;
export const minPasswordLength = 8;
// bcrypt ignores everything after 72 bytes, so longer passwords would be silently cut
export const maxPasswordBytes = 72;

// Passwords are hashed and compared exactly as typed. They are never shown on a page and only
// reach SQL as parameters, so escaping them would protect nothing and break some passwords.
export const hashPassword = (password: string): Promise<string> =>
    bcrypt.hash(password, saltRounds);

export const verifyPassword = (password: string, hash: string): Promise<boolean> =>
    bcrypt.compare(password, hash);

// Rule for a new password (reset and profile); login accepts whatever was stored
export const isValidNewPassword = (password: unknown): password is string =>
    typeof password === "string" &&
    password.length >= minPasswordLength &&
    Buffer.byteLength(password, "utf8") <= maxPasswordBytes;

// Tokens are only ever signed and verified with this algorithm
export const tokenAlgorithm = "HS256" as const;

export const createTokenSigner =
    (secret: string, expiresIn: string = "24h") =>
    (payload: TokenPayloadIF): string =>
        jwt.sign({ id: payload.id, tv: payload.tv }, secret, {
            algorithm: tokenAlgorithm,
            expiresIn: expiresIn as jwt.SignOptions["expiresIn"]
        });

export const verifyToken = (token: string, secret: string) =>
    jwt.verify(token, secret, { algorithms: [tokenAlgorithm] });

export interface SessionUserIF {
    id: number;
    role: string;
    token_version: number;
}

export interface SessionIF {
    id: number;
    role: string;
    tv: number;
}

// The caller behind a verified token payload, or null when the account no longer exists or
// the token was issued before its last password or email change
export const resolveSession = async (
    payload: unknown,
    findUser: (id: number) => Promise<SessionUserIF | null>
): Promise<SessionIF | null> => {
    if (!payload || typeof payload !== "object") return null;

    const { id, tv } = payload as Record<string, unknown>;

    if (!Number.isInteger(id) || !Number.isInteger(tv)) return null;

    const user = await findUser(id as number);

    if (!user || Number(user.token_version) !== tv) return null;

    return { id: user.id, role: user.role, tv: Number(user.token_version) };
};

// An unknown username is checked against this hash too, so both answers take as long and the
// response time does not show which emails have an account. It is made once, when the API
// starts, from random bytes that are never stored, so no typed password can match it.
const timingHash = bcrypt.hash(crypto.randomBytes(32).toString("hex"), saltRounds);

export const checkCredentials = async (
    rawUsername: string | number | undefined,
    rawPassword: string | number | undefined,
    deps: CredentialsDepsIF
): Promise<LoginResultIF> => {
    const username = sanitize(rawUsername ?? "");
    const password = rawPassword === undefined ? "" : String(rawPassword);

    if (!username || !password) {
        return { success: false, message: missingInfoMessage };
    }

    const { success, user } = await deps.findUser(String(username));

    if (!success || !user || !user.password) {
        await deps.comparePassword(password, await timingHash);
        console.error("5.2 - failed login due no user with such username or no password set");

        return { success: false, message: loginFailedMessage };
    }

    const isValid = await deps.comparePassword(password, user.password);

    if (!isValid) {
        console.error("5-3 failed login due mismatch with db fields or incorrect password");

        return { success: false, message: loginFailedMessage };
    }

    return {
        success: true,
        token: deps.signToken({ id: user.id, tv: Number(user.token_version) || 0 })
    };
};
