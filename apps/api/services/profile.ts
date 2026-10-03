import crypto from "crypto";
import { email, getConfig, sanitizeFilename } from "./_helpers";
import { query } from "../helper/query";
import bcrypt from "bcryptjs";
import type { UserIF } from "../types/user";
import type { Request } from "express";
import { authUser } from "../helpers/authorize";

const saltRounds = 10;

export const getSingle = async (request: Request) => {
    const { user, database } = request;
    const { id } = user as UserIF;

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

export const putSingle = async (request: Request) => {
    const {
        body: { name, email, password },
        file,
        database
    } = request;
    // The profile is always the caller's own: the id comes from the token, never the body
    const id = authUser(request)?.id;
    const fileExists = file && file.filename;

    if (!id) {
        return {
            success: false,
            message: "get.user"
        };
    }

    let avatar = fileExists ? sanitizeFilename(file.filename) : null;
    let hashedPassword;

    if (password) {
        hashedPassword = await bcrypt.hash(password, saltRounds);
    }

    // import theme from req.body
    // sql - theme    = ?`;
    // params - theme
    let sql = `UPDATE users
               SET username = ?,
                   name     = ?`;
    const params = [email, name];

    if (password) {
        sql += `, password = ?`;
        params.push(hashedPassword);
    }

    if (fileExists) {
        sql += `, avatar = ?`;
        params.push(avatar);
    }

    sql += ` WHERE id = ?;`;
    params.push(id);

    const { success } = await query({
        database,
        sql,
        params,
        logger: "Update profile details"
    });

    if (!success) {
        return {
            success: false,
            message: "put.profile"
        };
    }

    if (!fileExists) {
        const { success, data } = await query<UserIF>({
            database,
            sql: `SELECT avatar
                  FROM users
                  WHERE id = ?;`,
            params: [id],
            logger: "Get avatar"
        });

        if (!success) {
            return {
                success: false,
                message: "get.avatar"
            };
        }

        avatar = data?.[0].avatar || null;
    }

    return {
        success: true,
        filename: avatar
    };
};

export const forgot = async (username: string, request: Request) => {
    const baseUrl = request.get("origin");
    const { database } = request;
    const {
        success: configSuccess,
        data: config,
        message
    } = await getConfig({
        database,
        fields: ["forgotSubject", "forgotText", "forgotHtml"],
        mapper: ["subject", "text", "html"]
    });

    if (!configSuccess) {
        return {
            success: false,
            message
        };
    }

    // check if we even have that email address in DB
    const { success: userSuccess, data: userData } = await query<UserIF>({
        database,
        sql: `SELECT id
              FROM users
              WHERE username = ?`,
        params: [username],
        logger: "Check if user exists"
    });
    const user = userData?.[0]?.id;

    // send fake true as there is no such user but use early return to not proceed
    if (!userSuccess || !user) {
        return {
            success: true
        };
    }

    // generate token
    const token = crypto.randomBytes(32).toString("hex"); // 32 bytes × 2 hex chars = 64 characters
    const link = `${baseUrl}/restore/${token}`;

    // add reset token to DB
    const { success: tokenSuccess } = await query({
        database,
        sql: `UPDATE users
              SET forgot_token = ?
              WHERE username = ?;`,
        params: [token, username],
        logger: "Update user reset token"
    });

    if (!tokenSuccess) {
        return {
            success: false,
            message: "put.token"
        };
    }

    // inject reset token to email
    return await email({
        email: username,
        config,
        replace: {
            "[RESTORE_LINK]": link
        }
    });
};

export const getToken = async (request: Request, returnId = false) => {
    const {
        body: { token },
        database
    } = request;

    // check if we even have that token in DB
    const { success, data } = await query<UserIF>({
        database,
        sql: `SELECT id
              FROM users
              WHERE forgot_token = ?;`,
        params: [token],
        logger: "Check if token exists"
    });
    const userId = data?.[0]?.id;

    if (!success || !userId) {
        return false;
    }

    return returnId ? userId : true;
};

export const putToken = async (request: Request) => {
    const {
        body: { password },
        database
    } = request;

    const id = await getToken(request, true);

    if (!id) {
        return false;
    }

    const hashed = await bcrypt.hash(password, 10);
    const { success } = await query({
        database,
        sql: `UPDATE users
              SET password    = ?,
                  forgot_token = ''
              WHERE id = ?`,
        params: [hashed, id],
        logger: "Update user password"
    });

    return success;
};
