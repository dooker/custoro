import * as Sentry from "@sentry/node";
import { email, getConfig, sanitizeFilename } from "./_helpers";
import { query } from "../helper/query";
import type { UserIF } from "../types/user";
import type { Request } from "express";
import { authUser } from "../helpers/authorize";
import { hashPassword, isValidNewPassword, verifyPassword } from "../helpers/credentials";
import { checkResetToken, requestPasswordReset, resetPassword } from "../helpers/passwordReset";
import { getLoginThrottle, getResetThrottle } from "../helpers/rateLimit";
import { isUsernameTaken } from "../helpers/users";
import { getTokenSigner } from "./login";

export const getSingle = async (request: Request) => {
    const { database } = request;
    const id = authUser(request)?.id;

    if (!id) {
        return {
            success: false,
            message: "get.user"
        };
    }

    // This pick out "theme", it is disabled for now
    //
    // const config = getStorageConfig();
    // const userFields = config.schemas?.user;
    // ${userFields ? `${userFields}, ` : ""},

    let sql = `
        SELECT id,
               name,
               username AS email,
               timestamp,
               discount,
               avatar,
               offer,
               role
        FROM users
        WHERE id = ?;`;
    let params = [id];
    const { success, data } = await query({ database, sql, params, logger: "Get user details" });

    if (!success) {
        return {
            success: false,
            message: "get.user"
            // TODO transfer to frontend
            // message: "Post missing person ad because user is not found"
        };
    }

    sql = `
        UPDATE users
        SET timestamp = NOW()
        WHERE id = ?`;
    params = [id];
    await query({ database, sql, params, logger: "Update user timestamp" });

    return {
        success: true,
        resource: data?.[0]
    };
};

// Simple shape check; the address is only used as the login name and for reset emails
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ProfileUserIF {
    username: string | null;
    password: string | null;
    avatar: string | null;
}

export const putSingle = async (request: Request) => {
    const {
        body: { name, email, password, currentPassword },
        file,
        database
    } = request;
    // The profile is always the caller's own: the id comes from the token, never the body
    const caller = authUser(request);
    const id = caller?.id;
    const fileExists = file && file.filename;

    if (!id) {
        return {
            success: false,
            message: "get.user"
        };
    }

    if (typeof email !== "string" || !emailPattern.test(email.trim())) {
        return {
            success: false,
            message: "emailFormat"
        };
    }

    const newEmail = email.trim();

    if (password && !isValidNewPassword(password)) {
        return {
            success: false,
            message: "passwordLength"
        };
    }

    const { success: currentSuccess, data: currentData } = await query<ProfileUserIF>({
        database,
        sql: `SELECT username,
                     password,
                     avatar
              FROM users
              WHERE id = ?;`,
        params: [id],
        logger: "Get profile for update"
    });
    const current = currentData?.[0];

    if (!currentSuccess || !current) {
        return {
            success: false,
            message: "get.user"
        };
    }

    // A new password or email can take over the account (the email receives reset links), so
    // both need the current password, not just a token that may have been stolen
    const changesEmail = newEmail !== current.username;
    const changesCredentials = !!password || changesEmail;

    if (changesCredentials) {
        const throttle = getLoginThrottle();
        const ip = request.ip ?? "unknown";
        const accountName = current.username ?? String(id);

        if (throttle.retryAfterSeconds(ip, accountName) > 0) {
            return {
                success: false,
                message: "tooManyAttempts"
            };
        }

        const isCurrentPassword =
            typeof currentPassword === "string" &&
            !!currentPassword &&
            !!current.password &&
            (await verifyPassword(currentPassword, current.password));

        if (!isCurrentPassword) {
            if (currentPassword) throttle.recordFailure(ip, accountName);

            return {
                success: false,
                message: "currentPassword"
            };
        }
    }

    if (changesEmail && (await isUsernameTaken(database, newEmail, id))) {
        return {
            success: false,
            message: "user.exists"
        };
    }

    let avatar = fileExists ? sanitizeFilename(file.filename) : null;

    // import theme from req.body
    // sql - theme    = ?`;
    // params - theme
    let sql = `UPDATE users
               SET username = ?,
                   name     = ?`;
    const params: (string | number)[] = [newEmail, typeof name === "string" ? name : ""];

    if (password) {
        sql += `, password = ?`;
        params.push(await hashPassword(password));
    }

    // Ends every other session; the caller gets a fresh token below
    if (changesCredentials) {
        sql += `, token_version = token_version + 1`;
    }

    if (fileExists && avatar) {
        sql += `, avatar = ?`;
        params.push(avatar);
    }

    sql += ` WHERE id = ?;`;
    params.push(id);

    const { success, code } = await query({
        database,
        sql,
        params,
        logger: "Update profile details"
    });

    if (!success) {
        return {
            success: false,
            message: code === "ER_DUP_ENTRY" ? "user.exists" : "put.profile"
        };
    }

    if (!fileExists) {
        avatar = current.avatar || null;
    }

    return {
        success: true,
        filename: avatar,
        ...(changesCredentials
            ? { token: getTokenSigner()({ id, tv: (caller?.tv ?? 0) + 1 }) }
            : {})
    };
};

// Answers before any work is done, so the response never shows whether the address has an
// account; failures only reach the server log and Sentry
export const forgot = (username: string, request: Request) => {
    const { database } = request;
    // The link always points at the configured app, never at the request's Origin header
    const appOrigin = process.env.APP_ORIGIN || "http://localhost:3000";
    const reportError = (message: string) => {
        console.error(message);
        Sentry.captureMessage(message, "error");
    };

    // Limits reset emails per address and per account. Over the limit the answer is still
    // success, so it says nothing about the account; the request is only logged.
    if (!getResetThrottle().allow(request.ip ?? "unknown", username)) {
        reportError("Password reset: request refused, too many requests");

        return { success: true };
    }

    void requestPasswordReset(username, appOrigin, {
        findUserId: async (name) => {
            const { data } = await query<UserIF>({
                database,
                sql: `SELECT id
                      FROM users
                      WHERE username = ?`,
                params: [name],
                logger: "Check if user exists"
            });

            return data?.[0]?.id ?? null;
        },
        saveToken: async (userId, tokenHash, expiresAt) => {
            const { success } = await query({
                database,
                sql: `UPDATE users
                      SET forgot_token         = ?,
                          forgot_token_expires = ?
                      WHERE id = ?;`,
                params: [tokenHash, expiresAt.toISOString().slice(0, 19).replace("T", " "), userId],
                logger: "Update user reset token"
            });

            return success;
        },
        sendEmail: async (to, link) => {
            const config = await getConfig({
                database,
                fields: ["forgotSubject", "forgotText", "forgotHtml"],
                mapper: ["subject", "text", "html"]
            });

            if (!config.success) {
                return { success: false, message: config.message };
            }

            return email({ email: to, config: config.data, replace: { "[RESTORE_LINK]": link } });
        },
        reportError
    });

    return { success: true };
};

const findUserIdByTokenHash = async (database: string, tokenHash: string) => {
    const { data } = await query<UserIF>({
        database,
        sql: `SELECT id
              FROM users
              WHERE forgot_token = ?
                AND forgot_token_expires > UTC_TIMESTAMP();`,
        params: [tokenHash],
        logger: "Check if token exists"
    });

    return data?.[0]?.id ?? null;
};

export const getToken = async (request: Request) => {
    const { body, database } = request;

    return checkResetToken(body?.token, {
        findUserIdByTokenHash: (tokenHash) => findUserIdByTokenHash(database, tokenHash)
    });
};

export const putToken = async (request: Request) => {
    const { body, database } = request;

    return resetPassword(body?.token, body?.password, {
        consumeToken: async (tokenHash, passwordHash) => {
            const { success, affectedRows } = await query({
                database,
                sql: `UPDATE users
                      SET password             = ?,
                          forgot_token         = NULL,
                          forgot_token_expires = NULL,
                          token_version        = token_version + 1
                      WHERE forgot_token = ?
                        AND forgot_token_expires > UTC_TIMESTAMP();`,
                params: [passwordHash, tokenHash],
                logger: "Update user password"
            });

            return success && affectedRows === 1;
        }
    });
};
