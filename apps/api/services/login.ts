import * as helper from "../helper";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { query } from "../helper/query";
import type { UserIF } from "../types/user";
import type { Request } from "express";

export const postSingle = async (request: Request) => {
    const { body, database } = request;
    const jwtSecret = process.env.JWT_SECRET;
    const username = helper.sanitize(body.username);
    const password = helper.sanitize(body.password);
    const message = "None shall pass!";

    if (!jwtSecret) {
        throw new Error("JWT_SECRET is not defined in environment variables");
    }

    if (!username || !password) {
        return {
            success: false,
            message: "Cannot login, missing vital info"
        };
    }

    const sql = `
        SELECT id,
               password,
               role
        FROM users
        WHERE username = ?`;
    const params = [username];
    const { success, data } = await query({ database, sql, params, logger: "Get user details" });
    const user = data?.[0] as UserIF;

    if (!success || !user) {
        console.error("5.2 - failed login due no user with such username");

        return {
            success: false,
            message
        };
    }

    const isValid = await bcrypt.compare(String(password), String(user.password));

    if (!isValid) {
        console.error("5-3 failed login due mismatch with db fields or incorrect password");

        return {
            success: false,
            message
        };
    }

    const token = jwt.sign(
        {
            id: user.id,
            role: user.role
        },
        jwtSecret,
        {
            expiresIn: "24h"
        }
    );

    return {
        success: true,
        token
    };
};
