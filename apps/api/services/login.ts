import { query } from "../helper/query";
import {
    checkCredentials,
    createTokenSigner,
    verifyPassword,
    type LoginResultIF,
    type LoginUserIF
} from "../helpers/credentials";
import { getLoginThrottle, tooManyAttemptsMessage } from "../helpers/rateLimit";
import type { Request } from "express";

export type LoginResponseIF =
    LoginResultIF | { success: false; message: string; retryAfter: number };

export const getTokenSigner = () => {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
        throw new Error("JWT_SECRET is not defined in environment variables");
    }

    return createTokenSigner(jwtSecret, process.env.JWT_EXPIRES_IN || "24h");
};

export const postSingle = async (request: Request): Promise<LoginResponseIF> => {
    const { body, database } = request;
    const signToken = getTokenSigner();
    const throttle = getLoginThrottle();
    const ip = request.ip ?? "unknown";
    const username = typeof body?.username === "string" ? body.username : "";
    const retryAfter = throttle.retryAfterSeconds(ip, username);

    if (retryAfter > 0) {
        console.error("Login refused: too many failed attempts");

        return { success: false, message: tooManyAttemptsMessage, retryAfter };
    }

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
        comparePassword: verifyPassword,
        signToken
    });

    if (result.success) {
        throttle.recordSuccess(username);
    } else {
        throttle.recordFailure(ip, username);
    }

    return result;
};
