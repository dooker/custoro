"use strict";

// Adds users.token_version. Every login token carries the version it was issued with, and the
// API refuses a token whose version no longer matches. A password reset or a password or email
// change raises the version, which ends all older sessions.
// Login tokens issued before this migration carry no version, so everyone logs in once more.
// Fresh installs already have the column from db/01-schema.sql; the check keeps this safe there.

const addVersionColumn = `
    SET @add_column := (
        SELECT IF(COUNT(*) = 0,
                  'ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER role',
                  'DO 0')
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'token_version'
    );
    PREPARE add_column_statement FROM @add_column;
    EXECUTE add_column_statement;
    DEALLOCATE PREPARE add_column_statement;
`;

exports.up = async (db) => {
    await db.runSql(addVersionColumn);
};

// Not reversible on purpose: the API needs the column, and on fresh installs it belongs to the
// base schema.
exports.down = async () => {};

exports._meta = {
    version: 1
};
