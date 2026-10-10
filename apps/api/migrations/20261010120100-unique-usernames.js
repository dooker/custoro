"use strict";

// Usernames (login emails) must be unique. The profile page used to let any user take another
// user's email, after which login and password reset picked whichever row MySQL returned
// first. The API now checks for duplicates; this unique index stops them at the database too.
//
// Stops with a list of the duplicates if any exist: which account keeps the address is a
// decision for a person, so change the others by hand and run the migration again. The
// comparison is case-insensitive, like the column.
// Fresh installs already have the index from db/01-schema.sql; the check keeps this safe there.

const findDuplicates = `
    SELECT username, GROUP_CONCAT(id ORDER BY id) AS ids
    FROM users
    WHERE username IS NOT NULL
    GROUP BY username
    HAVING COUNT(*) > 1;
`;

const addUniqueIndex = `
    SET @add_index := (
        SELECT IF(COUNT(*) = 0,
                  'ALTER TABLE users ADD UNIQUE KEY username_UNIQUE (username)',
                  'DO 0')
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND INDEX_NAME = 'username_UNIQUE'
    );
    PREPARE add_index_statement FROM @add_index;
    EXECUTE add_index_statement;
    DEALLOCATE PREPARE add_index_statement;
`;

exports.up = async (db) => {
    const duplicates = await db.runSql(findDuplicates);

    if (duplicates.length) {
        const list = duplicates.map((row) => `${row.username} (user ids ${row.ids})`).join("; ");

        throw new Error(`Duplicate usernames must be resolved first: ${list}`);
    }

    await db.runSql(addUniqueIndex);
};

// Not reversible on purpose: dropping the index would allow duplicate logins again, and on
// fresh installs it belongs to the base schema.
exports.down = async () => {};

exports._meta = {
    version: 1
};
