import { query } from "../helper/query";
import {
    checkCredentials,
    createTokenSigner,
    verifyPassword,
    type LoginResultIF,
    type LoginUserIF
} from "../helpers/credentials";
import { accountKey, getLoginThrottle, tooManyAttemptsMessage } from "../helpers/rateLimit";
import type { Request } from "express";

export const getTokenSigner = () => {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
        throw new Error("JWT_SECRET is not defined in environment variables");
    }

    return createTokenSigner(jwtSecret, process.env.JWT_EXPIRES_IN || "24h");
};

export const postSingle = async (request: Request): Promise<LoginResultIF> => {
    const { body, database } = request;
    const signToken = getTokenSigner();
    const throttle = getLoginThrottle();
    const ip = request.ip ?? "unknown";
    const username = typeof body?.username === "string" ? body.username : "";
    const refused = (retryAfter: number) => {
        console.error("Login refused: too many failed attempts");

        return { success: false as const, message: tooManyAttemptsMessage, retryAfter };
    };

    // An address that has used up its failures is turned away before any database work
    const addressRetryAfter = throttle.addressRetryAfterSeconds(ip);

    if (addressRetryAfter > 0) {
        return refused(addressRetryAfter);
    }

    // Counted by the account the lookup finds, not by the spelling typed (see accountKey)
    let account = accountKey(undefined, username);

    const result = await checkCredentials(body?.username, body?.password, {
        findUser: async (name) => {
            const { success, data } = await query<LoginUserIF>({
                database,
                sql: `
                    SELECT id,
                           password,
                           role,
                           token_version
                    FROM users
                    WHERE username = ?`,
                params: [name],
                logger: "Get user details"
            });

            return { success, user: data?.[0] };
        },
        retryAfterSeconds: (user) => {
            account = accountKey(user?.id, username);

            return throttle.retryAfterSeconds(ip, account);
        },
        comparePassword: verifyPassword,
        signToken
    });

    if (result.success) {
        throttle.recordSuccess(ip, account);
    } else if (result.retryAfter) {
        console.error("Login refused: too many failed attempts");
    } else {
        throttle.recordFailure(ip, account);
    }

    return result;
};
