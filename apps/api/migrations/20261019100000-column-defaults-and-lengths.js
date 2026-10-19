"use strict";

// Two things the API tripped over on a MySQL server with strict mode (the default):
//
// 1. users.token and users.theme are NOT NULL without a default, and so is users.avatar, but
//    the admin's "create user" statement sets none of them, so every new user failed with
//    "Field 'token' doesn't have a default value". They (and a few more columns that the API
//    leaves out when a form field is empty) now default to an empty string.
// 2. Email addresses are up to 254 characters, but the login email (users.username) and the
//    customer emails were 45, so a longer address could not be saved.
//
// MODIFY only widens columns and adds defaults, so it keeps all data and can run again on a
// database that already has the change.

exports.up = async (db) => {
    await db.runSql(`
        ALTER TABLE users
            MODIFY username VARCHAR(254) DEFAULT NULL,
            MODIFY name VARCHAR(100) DEFAULT NULL,
            MODIFY token VARCHAR(250) NOT NULL DEFAULT '',
            MODIFY theme VARCHAR(25) NOT NULL DEFAULT '',
            MODIFY avatar VARCHAR(250) NOT NULL DEFAULT '';
    `);

    await db.runSql(`
        ALTER TABLE customers
            MODIFY contact VARCHAR(100) DEFAULT NULL,
            MODIFY email VARCHAR(254) DEFAULT NULL,
            MODIFY invoice_email VARCHAR(254) NOT NULL DEFAULT '',
            MODIFY www VARCHAR(255) NOT NULL DEFAULT '',
            MODIFY department VARCHAR(250) NOT NULL DEFAULT '';
    `);

    await db.runSql(`ALTER TABLE products MODIFY comment VARCHAR(500) NOT NULL DEFAULT '';`);
    await db.runSql(`ALTER TABLE invoice_items MODIFY comment VARCHAR(500) NOT NULL DEFAULT '';`);
};

// Not reversible on purpose: narrowing the columns again would cut longer addresses, and on
// fresh installs the final definitions belong to the base schema.
exports.down = async () => {};

exports._meta = {
    version: 1
};
