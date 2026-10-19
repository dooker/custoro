"use strict";

// The tables used three different character sets / collations:
//   config, invoices, invoice_items, worksheets  utf8mb4_unicode_ci
//   customers, users                             utf8mb4_general_ci
//   products                                     utf8mb3_general_ci
// utf8mb3 stores at most 3 bytes per character, so an emoji or other 4-byte character in a product
// name was refused ("Incorrect string value"), while the same text on an invoice line was accepted.
// Comparing text from tables with different collations (a join or a UNION on a text column) also
// fails with "Illegal mix of collations".
//
// All tables use utf8mb4_unicode_ci now, a collation MySQL and MariaDB both have. Like the old ones
// it ignores case and accents, so users.username (the login email) still matches "Admin@x.ee" for
// "admin@x.ee"; the API therefore mails password resets to the stored address, not the typed one.
//
// Stops if two rows that were different now compare equal (a unique column such as users.username
// or products.code with values that only differ by something the new collation ignores): which
// row to keep is a decision for a person. Tables that already use the collation are skipped.

const { getTableCollation } = require("../config/migrationHelpers");

const collation = "utf8mb4_unicode_ci";
const tables = ["customers", "users", "products"];

exports.up = async (db) => {
    for (const table of tables) {
        if ((await getTableCollation(db, table)) === collation) {
            continue;
        }

        try {
            await db.runSql(
                `ALTER TABLE ${table} CONVERT TO CHARACTER SET utf8mb4 COLLATE ${collation};`
            );
        } catch (error) {
            if (error?.code === "ER_DUP_ENTRY") {
                throw new Error(
                    `${table} has values that are different now but equal under ${collation} ` +
                        `(${error.sqlMessage}). Change one of them by hand, then run the migration again.`,
                    { cause: error }
                );
            }

            throw error;
        }
    }
};

// Not reversible on purpose: utf8mb3 would refuse some of the stored text, and on fresh installs
// the collation belongs to the base schema.
exports.down = async () => {};

exports._meta = {
    version: 1
};
