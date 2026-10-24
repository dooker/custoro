"use strict";

// Copy to apps/api/migrations/<YYYYMMDDHHMMSS>-<what-it-does>.js and fill in.
//
// <The symptom people saw, in two or three sentences, not the SQL: what broke, how it was found.>
//
// <What this migration changes, and what it deliberately leaves alone.>
//
// Stops with a list if <the rows that would break the new rule>: which row to keep is a decision
// for a person. Every step checks what exists first, so this is safe on a fresh install
// (db/01-schema.sql already has the change) and on a second run, on MySQL 8.4 and MariaDB 11.4.

const {
    addIndexIfMissing,
    getColumn,
    hasForeignKey,
    refuseDuplicates,
    refuseOrphans
} = require("../config/migrationHelpers");

exports.up = async (db) => {
    // 1. Refuse data that would break the new rule. Nothing has been changed before this point,
    //    and MySQL cannot roll a structure change back.
    await refuseDuplicates(db, { table: "products", columns: ["code"], what: "Product codes" });
    await refuseOrphans(db, { table: "worksheets", column: "product_id", parent: "products" });

    // 2. Change the structure, each step only when it is not done yet.
    await addIndexIfMissing(db, "products", "code_UNIQUE", "UNIQUE KEY code_UNIQUE (code)");

    const price = await getColumn(db, "products", "price");

    if (price?.dataType === "float") {
        await db.runSql(`ALTER TABLE products MODIFY price DECIMAL(12,4) NOT NULL;`);
    }

    if (!(await hasForeignKey(db, "worksheets", "fk_worksheets_product"))) {
        await db.runSql(`
            ALTER TABLE worksheets
                ADD CONSTRAINT fk_worksheets_product FOREIGN KEY (product_id)
                    REFERENCES products (id) ON DELETE RESTRICT;
        `);
    }
};

// Not reversible on purpose: <why going back is wrong, e.g. it would allow duplicate codes again>,
// and on fresh installs the change belongs to the base schema.
exports.down = async () => {};

exports._meta = {
    version: 1
};
