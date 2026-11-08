"use strict";

// The login and the password reset look the email up without surrounding spaces, as the profile
// page stores it. The users page stored it as typed, so an account saved as " ann@example.test"
// could never log in or get a reset email. The API trims it now; this trims the accounts that
// were stored with spaces, tabs or line breaks at either end. The address itself, the sessions
// and any open password link stay as they are.
//
// Stops with a list if a trimmed address is one another account already has (the unique key
// would refuse it anyway): which account keeps the address is a decision for a person. Safe on a
// fresh install and on a second run (nothing to trim), on MySQL 8.4 and MariaDB 11.4.

const untrimmed = "username REGEXP '^[[:space:]]|[[:space:]]$'";
const trimmed = "REGEXP_REPLACE(username, '^[[:space:]]+|[[:space:]]+$', '')";

exports.up = async (db) => {
    const clashes = await db.runSql(`
        SELECT spaced.id AS id, other.id AS otherId, other.username AS username
        FROM users AS spaced
                 INNER JOIN users AS other
                            ON other.id <> spaced.id
                                AND other.username = ${trimmed.replace(/username/g, "spaced.username")}
        WHERE ${untrimmed.replace("username", "spaced.username")};
    `);

    if (clashes.length) {
        const list = clashes
            .slice(0, 20)
            .map((row) => `user ${row.id} would become "${row.username}" of user ${row.otherId}`)
            .join("; ");

        throw new Error(
            `Usernames with spaces cannot be trimmed: ${list}. Change or remove one of each pair by hand, then run the migration again.`
        );
    }

    await db.runSql(`UPDATE users SET username = ${trimmed} WHERE ${untrimmed};`);
};

// Not reversible: putting the spaces back would only lock those users out again
exports.down = async () => {};

exports._meta = {
    version: 1
};
