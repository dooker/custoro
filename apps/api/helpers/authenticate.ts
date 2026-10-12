import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { query } from "../helper/query";
import { resolveSession, verifyToken, type SessionUserIF } from "./credentials";

const findSessionUser = async (database: string, id: number) => {
    const { success, data } = await query<SessionUserIF>({
        database,
        sql: `SELECT id,
                     role,
                     token_version
              FROM users
              WHERE id = ?;`,
        params: [id],
        logger: "Get session user"
    });

    return success ? (data?.[0] ?? null) : null;
};

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
        console.error("Missing or malformed token");

        return res.status(401).json({
            success: false,
            message: "auth.header"
        });
    }

    const token = authHeader.split(" ")[1];
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
        console.error("Missing JWT secret");

        return res.status(500).json({
            success: false,
            message: "server.error"
        });
    }

    let payload: unknown;

    try {
        payload = verifyToken(token, jwtSecret);
    } catch (err) {
        return res.status(200).json({
            success: false,
            message: err instanceof jwt.TokenExpiredError ? "session.expired" : "invalid.token"
        });
    }

    // The account must still exist and the token must be newer than its last password or
    // email change. The role comes from the database, so a role change applies at once.
    const session = await resolveSession(payload, (id) => findSessionUser(req.database, id));

    if (!session) {
        return res.status(200).json({
            success: false,
            message: "invalid.token"
        });
    }

    req.user = session;

    next();
};
