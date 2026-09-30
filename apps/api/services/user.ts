import { deleteImageFile, postGeneralSingle, sanitizeFilename } from "./_helpers";
import { query } from "../helper/query";
import type { QueryResult } from "../types/query";
import type { Request } from "express";
import { currentRoute as type } from "../routes/user";
import type { UserIF } from "../types/user";

export const getSingle = async (request: Request): Promise<QueryResult<UserIF>> => {
    const {
        database,
        params: { id }
    } = request;

    const { success, data } = await query<UserIF>({
        database,
        sql: `SELECT id,
                     name,
                     username,
                     discount,
                     offer,
                     avatar,
                     role
              FROM users
              WHERE id = ?;`,
        params: [id as string],
        logger: type
    });

    if (!success) {
        return {
            success: false,
            message: "get.user"
        };
    }

    return {
        success: true,
        data
    };
};

export const postSingle = async (request: Request) => {
    const {
        body: { name, username, discount, offer, role },
        database,
        file
    } = request;

    const { success: userCheckSuccess, data } = await query<{ count: number }>({
        database,
        sql: `SELECT COUNT(id) as count
              FROM users
              WHERE username = ?;`,
        params: [username],
        logger: type
    });

    if (!userCheckSuccess || Number(data?.[0].count) > 0) {
        return {
            success: false,
            message: "user.exists"
        };
    }

    const fileExists = file && file.filename;
    const avatar = fileExists ? sanitizeFilename(file.filename) : null;
    let sql = `INSERT INTO users
               SET name            = ?,
                   username        = ?,
                   discount        = ?,
                   offer           = ?,
                   role            = ?`;
    const params = [name, username, discount, offer, role];

    if (fileExists && avatar) {
        sql += `, avatar = ?`;
        params.push(avatar);
    }

    // TODO send password recovery email

    return await postGeneralSingle({
        database,
        sql,
        params,
        logger: type
    });
};

export const putSingle = async (request: Request) => {
    const {
        body: { id, name, username, discount, offer, role },
        file,
        database
    } = request;
    const fileExists = file && file.filename;
    let avatar = fileExists ? sanitizeFilename(file.filename) : null;

    let sql = `UPDATE users
               SET name            = ?,
                   username        = ?,
                   discount        = ?,
                   offer           = ?,
                   role            = ?`;
    const params = [name, username, discount, offer, role];

    if (fileExists && avatar) {
        sql += `, avatar = ?`;
        params.push(avatar);
    }

    sql += ` WHERE id = ?;`;
    params.push(id);

    const { success } = await query({
        database,
        sql,
        params,
        logger: "Update user details"
    });

    if (!success) {
        return {
            success: false,
            message: "put.user"
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

export const deleteSingle = async (request: Request) => {
    const {
        params: { id },
        database
    } = request;

    const { success: getAvatarSuccess, data } = await query<{ avatar: string | null }>({
        database,
        sql: `SELECT avatar
              FROM users
              WHERE id = ?;`,
        params: [id as string],
        logger: "Get customer avatar"
    });

    if (!getAvatarSuccess) {
        return {
            success: false,
            message: "get.avatar"
        };
    }

    const avatar = data?.[0].avatar || null;

    if (avatar) {
        deleteImageFile(avatar);
    }

    const { success } = await query({
        database,
        sql: `DELETE
              FROM users
              WHERE id = ?;`,
        params: [id as string],
        logger: `Delete single ${type}`
    });

    return {
        success
    };
};
