import { TransactionRefusal, withTransaction } from "../helper/transaction";
import { hashPassword, isValidNewPassword } from "../helpers/credentials";
import type { RowDataPacket } from "mysql2/promise";

export type SaveAdminResult = { ok: true; created: boolean } | { ok: false; message: string };

interface SaveAdminIF {
    database: string;
    // The company a new admin belongs to (company 1 on a fresh install)
    tenantId: number;
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
    tenantId,
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
            // Over all companies: an email belongs to one company only
            const [found] = await connection.query<RowDataPacket[]>(
                `/* every company: an email is unique over all companies */
                 SELECT id
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
                    `/* every company: the account found by its email above, in its own company */
                     UPDATE users
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

            const [companies] = await connection.query<RowDataPacket[]>(
                `SELECT id
                 FROM tenants
                 WHERE id = ?;`,
                [tenantId]
            );

            if (!companies.length) {
                throw new TransactionRefusal("tenant.missing");
            }

            // The first admin of an install without an owner (a fresh install) is its owner
            const [owners] = await connection.query<RowDataPacket[]>(
                `/* every company: is there an owner of the install at all */
                 SELECT id
                 FROM users
                 WHERE owner = 1
                 FOR UPDATE;`
            );

            await connection.query(
                `INSERT INTO users
                 SET tenant_id = ?,
                     username  = ?,
                     name      = ?,
                     password  = ?,
                     role      = 'admin',
                     owner     = ?;`,
                [tenantId, username, name, passwordHash, owners.length ? 0 : 1]
            );

            return true;
        }
    );

    return saved.ok ? { ok: true, created: saved.value } : { ok: false, message: saved.message };
};
