"use strict";

// Password reset fix (see CHANGELOG): reset tokens are now stored as SHA-256 hashes with an
// expiry time, and an empty token no longer matches anyone.
//
// 1. Adds users.forgot_token_expires if it is missing. Fresh installs already have it from
//    db/01-schema.sql, so the check keeps this safe to run there too (MySQL and MariaDB).
// 2. Clears every stored reset token. Old tokens were stored in plain text, and finished resets
//    left an empty string that let anyone set that user's password. Pending reset links stop
//    working; users can request a new one.

const addExpiryColumn = `
    SET @add_column := (
        SELECT IF(COUNT(*) = 0,
                  'ALTER TABLE users ADD COLUMN forgot_token_expires DATETIME NULL DEFAULT NULL AFTER forgot_token',
                  'DO 0')
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'forgot_token_expires'
    );
    PREPARE add_column_statement FROM @add_column;
    EXECUTE add_column_statement;
    DEALLOCATE PREPARE add_column_statement;
`;

const clearResetTokens = `UPDATE users SET forgot_token = NULL, forgot_token_expires = NULL;`;

exports.up = async (db) => {
    await db.runSql(addExpiryColumn);
    await db.runSql(clearResetTokens);
};

// Not reversible on purpose: restoring the old tokens would reopen the hole, and on fresh
// installs the column belongs to the base schema.
exports.down = async () => {};

exports._meta = {
    version: 1
};
