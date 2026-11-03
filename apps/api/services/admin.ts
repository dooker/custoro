import { TransactionRefusal, withTransaction } from "../helper/transaction";
import { hashPassword, isValidNewPassword } from "../helpers/credentials";
import type { RowDataPacket } from "mysql2/promise";

export type SaveAdminResult = { ok: true; created: boolean } | { ok: false; message: string };

interface SaveAdminIF {
    database: string;
    username: string;
    name: string;
    password: string;
    // The user exists: give them this password and the admin role. Without it an existing user
    // is refused, so a mistyped command never changes an account.
    reset: boolean;
}

// A production database starts without users (db/02-seed.sql), so the first admin is made from
// the command line (scripts/createAdmin.ts). It also gets a locked-out admin back in.
export const saveAdmin = async ({
    database,
    username,
    name,
    password,
    reset
}: SaveAdminIF): Promise<SaveAdminResult> => {
    if (!isValidNewPassword(password)) {
        return { ok: false, message: "passwordLength" };
    }

    const passwordHash = await hashPassword(password);

    const saved = await withTransaction(
        database,
        "Save admin account",
        "error",
        async (connection) => {
            // Usernames compare case-insensitively, the same as the unique key
            const [found] = await connection.query<RowDataPacket[]>(
                `SELECT id
                 FROM users
                 WHERE username = ?
                 FOR UPDATE;`,
                [username]
            );
            const existing = found[0];

            if (existing && !reset) {
                throw new TransactionRefusal("user.exists");
            }

            if (!existing && reset) {
                throw new TransactionRefusal("get.user");
            }

            if (existing) {
                // A new password ends the user's other sessions and any pending reset link
                await connection.query(
                    `UPDATE users
                     SET password             = ?,
                         role                 = 'admin',
                         forgot_token         = NULL,
                         forgot_token_expires = NULL,
                         token_version        = token_version + 1
                     WHERE id = ?;`,
                    [passwordHash, existing.id]
                );

                return false;
            }

            await connection.query(
                `INSERT INTO users
                 SET username = ?,
                     name     = ?,
                     password = ?,
                     role     = 'admin';`,
                [username, name, passwordHash]
            );

            return true;
        }
    );

    return saved.ok ? { ok: true, created: saved.value } : { ok: false, message: saved.message };
};
