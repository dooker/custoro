"use strict";

// Invoice numbers must be unique. The API used to read the last number, add one and save it back
// in separate steps, so invoices created at the same time could get the same number. The API now
// reserves numbers in a transaction; this unique index stops duplicates at the database too.
//
// Stops with a list of the duplicates if any exist: renumbering issued invoices is a bookkeeping
// decision, so resolve them by hand and run the migration again.
// Fresh installs already have the index from db/01-schema.sql, so the check keeps this safe there.

const findDuplicates = `
    SELECT number, GROUP_CONCAT(id ORDER BY id) AS ids
    FROM invoices
    GROUP BY number
    HAVING COUNT(*) > 1;
`;

const addUniqueIndex = `
    SET @add_index := (
        SELECT IF(COUNT(*) = 0,
                  'ALTER TABLE invoices ADD UNIQUE KEY number_UNIQUE (number)',
                  'DO 0')
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'invoices'
          AND INDEX_NAME = 'number_UNIQUE'
    );
    PREPARE add_index_statement FROM @add_index;
    EXECUTE add_index_statement;
    DEALLOCATE PREPARE add_index_statement;
`;

exports.up = async (db) => {
    const duplicates = await db.runSql(findDuplicates);

    if (duplicates.length) {
        const list = duplicates.map((row) => `${row.number} (invoice ids ${row.ids})`).join("; ");

        throw new Error(`Duplicate invoice numbers must be resolved first: ${list}`);
    }

    await db.runSql(addUniqueIndex);
};

// Not reversible on purpose: dropping the index would allow duplicate numbers again, and on
// fresh installs it belongs to the base schema.
exports.down = async () => {};

exports._meta = {
    version: 1
};
