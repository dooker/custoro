import type { Request, Response, NextFunction } from "express";
import { AuthPayload } from "../types/express";

/** The verified token payload set by `authenticate`, or undefined on an unauthenticated request. */
export const authUser = (request: Request): AuthPayload | undefined =>
    request.user && typeof request.user === "object" ? request.user : undefined;

export const isAdmin = (request: Request) => authUser(request)?.role === "admin";

export const authorize = (allowedRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = req.user as AuthPayload;

        if (!user || !allowedRoles.includes(user.role)) {
            return res.status(403).json({
                success: false,
                message: "forbidden"
            });
        }

        next();
    };
};
