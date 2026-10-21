import { deleteImageFile, postGeneralSingle, sanitizeFilename } from "./_helpers";
import { query } from "../helper/query";
import type { QueryResult } from "../types/query";
import type { Request } from "express";
import { currentRoute as type } from "../routes/user";
import type { UserIF } from "../types/user";
import { isUsernameTaken } from "../helpers/users";
import { parseInput } from "../helpers/bodyInput";
import { userInput } from "../helpers/resourceInput";

// The login email is unique (users.username_UNIQUE), so two requests that both passed the
// look-up are told apart by the database: the second one gets ER_DUP_ENTRY
const duplicateEntry = "ER_DUP_ENTRY";

// The upload of a refused request is already on disk and nothing will refer to it
const discardUpload = (file?: { filename?: string }) => {
    if (file?.filename) {
        deleteImageFile(file.filename);
    }
};

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
    const { body, database, file } = request;
    const input = parseInput(body, userInput);

    if (!input.ok) {
        discardUpload(file);

        return { success: false, message: input.message };
    }

    const { name, username, discount, offer, role } = input.values;

    const { success: userCheckSuccess, data } = await query<{ count: number }>({
        database,
        sql: `SELECT COUNT(id) as count
              FROM users
              WHERE username = ?;`,
        params: [username],
        logger: type
    });

    if (!userCheckSuccess || Number(data?.[0].count) > 0) {
        discardUpload(file);

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
    const params: (string | number | null)[] = [name, username, discount, offer, role];

    if (fileExists && avatar) {
        sql += `, avatar = ?`;
        params.push(avatar);
    }

    // TODO send password recovery email

    const created = await postGeneralSingle({
        database,
        sql,
        params,
        logger: type
    });

    if (!created.success) {
        discardUpload(file);

        if ("code" in created && created.code === duplicateEntry) {
            return {
                success: false,
                message: "user.exists"
            };
        }
    }

    return created;
};

export const putSingle = async (request: Request) => {
    const {
        body,
        params: { id },
        file,
        database
    } = request;
    const input = parseInput(body, userInput);

    if (!input.ok) {
        discardUpload(file);

        return { success: false, message: input.message };
    }

    const { name, username, discount, offer, role } = input.values;
    const fileExists = file && file.filename;
    let avatar = fileExists ? sanitizeFilename(file.filename) : null;

    // The user is the one in the URL, not whatever id the body says
    const { success: currentSuccess, data: currentData } = await query<UserIF>({
        database,
        sql: `SELECT avatar
              FROM users
              WHERE id = ?;`,
        params: [Number(id)],
        logger: "Get user for update"
    });
    const current = currentData?.[0];

    if (!currentSuccess || !current) {
        discardUpload(file);

        return {
            success: false,
            message: "get.user"
        };
    }

    if (await isUsernameTaken(database, username, Number(id))) {
        discardUpload(file);

        return {
            success: false,
            message: "user.exists"
        };
    }

    // A new username (login email) ends the user's sessions, like a change on their own profile.
    // token_version is set first: MySQL applies SET assignments left to right, so the
    // comparison still sees the old username.
    let sql = `UPDATE users
               SET token_version   = token_version + IF(username <=> ?, 0, 1),
                   name            = ?,
                   username        = ?,
                   discount        = ?,
                   offer           = ?,
                   role            = ?`;
    const params: (string | number | null)[] = [username, name, username, discount, offer, role];

    if (fileExists && avatar) {
        sql += `, avatar = ?`;
        params.push(avatar);
    }

    sql += ` WHERE id = ?;`;
    params.push(Number(id));

    const { success, code } = await query({
        database,
        sql,
        params,
        logger: "Update user details"
    });

    if (!success) {
        discardUpload(file);

        return {
            success: false,
            message: code === duplicateEntry ? "user.exists" : "put.user"
        };
    }

    if (!fileExists) {
        avatar = current.avatar || null;
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

    // There is no such user
    if (!data?.[0]) {
        return {
            success: false,
            message: "get.user"
        };
    }

    const avatar = data[0].avatar || null;

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
