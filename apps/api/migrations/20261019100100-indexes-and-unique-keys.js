"use strict";

// Until now every table had only its primary key (plus the unique invoice number and username),
// so each lookup by customer, invoice, worksheet or hash read the whole table. On 50 000 invoices
// with 250 000 lines, "the lines of one invoice" took 32 ms and "the invoice behind a public PDF
// link" 6 ms; with the indexes below both are a single lookup.
//
// Also:
// - config.name is unique. The invoice number is reserved with SELECT ... FOR UPDATE on the
//   'lastInvoiceId' row; without an index on name that locked every row of config, and a second
//   'lastInvoiceId' row (nothing prevented one) made the counter ambiguous.
// - products.code is unique (the API only checked it before inserting, which two requests can race)
// - invoices.hash is unique: it is the only credential on a public PDF link
// - invoices.number_sort is the invoice number as a number, for sorting. The list used
//   ORDER BY number + 0, which cannot use an index and reads a number such as "INV-001" as 0.
//   Numbers that are not plain digits sort as 0, after all numbered invoices.
// - the unique key customers.id_UNIQUE repeated the primary key and is dropped
//
// Stops with a list if products.code, config.name or invoices.hash already have duplicates:
// which row to keep is a decision for a person. Every step checks what exists first, so this is
// safe on a fresh install and on a second run, on MySQL and MariaDB.

const {
    addIndexIfMissing,
    dropIndexIfPresent,
    getColumn,
    hasIndex,
    refuseDuplicates
} = require("../config/migrationHelpers");

exports.up = async (db) => {
    await refuseDuplicates(db, { table: "config", columns: ["name"], what: "Setting names" });
    await refuseDuplicates(db, { table: "products", columns: ["code"], what: "Product codes" });
    await refuseDuplicates(db, { table: "invoices", columns: ["hash"], what: "Invoice hashes" });

    await addIndexIfMissing(db, "config", "name_UNIQUE", "UNIQUE KEY name_UNIQUE (name)");
    await addIndexIfMissing(db, "products", "code_UNIQUE", "UNIQUE KEY code_UNIQUE (code)");
    await addIndexIfMissing(db, "invoices", "hash_UNIQUE", "UNIQUE KEY hash_UNIQUE (hash)");

    await addIndexIfMissing(
        db,
        "invoices",
        "idx_invoices_customer",
        "INDEX idx_invoices_customer (customer_id)"
    );

    await addIndexIfMissing(
        db,
        "invoice_items",
        "idx_items_invoice",
        "INDEX idx_items_invoice (invoice_id)"
    );
    await addIndexIfMissing(
        db,
        "invoice_items",
        "idx_items_worksheet",
        "INDEX idx_items_worksheet (worksheet_id)"
    );
    await addIndexIfMissing(
        db,
        "invoice_items",
        "idx_items_product",
        "INDEX idx_items_product (product_id)"
    );

    await addIndexIfMissing(
        db,
        "worksheets",
        "idx_worksheets_customer",
        "INDEX idx_worksheets_customer (customer_id, id)"
    );
    await addIndexIfMissing(
        db,
        "worksheets",
        "idx_worksheets_invoice",
        "INDEX idx_worksheets_invoice (invoice)"
    );
    await addIndexIfMissing(
        db,
        "worksheets",
        "idx_worksheets_product",
        "INDEX idx_worksheets_product (product_id)"
    );

    if (!(await getColumn(db, "invoices", "number_sort"))) {
        await db.runSql(`
            ALTER TABLE invoices
                ADD COLUMN number_sort BIGINT UNSIGNED
                    GENERATED ALWAYS AS (IF(number REGEXP '^[0-9]{1,18}$', CAST(number AS UNSIGNED), 0)) STORED
                    AFTER number;
        `);
    }

    if (!(await hasIndex(db, "invoices", "idx_invoices_number_sort"))) {
        await db.runSql(`ALTER TABLE invoices ADD INDEX idx_invoices_number_sort (number_sort);`);
    }

    await dropIndexIfPresent(db, "customers", "id_UNIQUE");
};

// Not reversible on purpose: dropping the unique keys would allow duplicates again, and on fresh
// installs all of this belongs to the base schema.
exports.down = async () => {};

exports._meta = {
    version: 1
};
