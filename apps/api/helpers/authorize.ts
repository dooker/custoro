import type { Request, Response, NextFunction } from "express";
import { AuthPayload } from "../types/express";

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
