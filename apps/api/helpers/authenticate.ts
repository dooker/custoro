import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuthPayload } from "../types/express";

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
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

    try {
        const decoded = jwt.verify(token, jwtSecret);

        if (typeof decoded === "string") {
            req.user = decoded;
        } else if (decoded && typeof decoded === "object" && "id" in decoded) {
            req.user = decoded as AuthPayload;
        } else {
            return res.status(401).json({
                success: false,
                message: "invalid.token"
            });
        }

        next();
    } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            return res.status(200).json({
                success: false,
                message: "session.expired"
            });
        }

        return res.status(200).json({
            success: false,
            message: "invalid.token"
        });
    }
};
