"use strict";

// The tables pointed at each other (invoice -> customer, line -> invoice, worksheet -> product, ...)
// with nothing enforcing it. Deleting a customer with invoices worked and left invoices without a
// customer; deleting a worksheet silently deleted its line from an issued invoice.
//
// What a delete does now:
// - a customer or product that worksheets or invoices still point at cannot be deleted (RESTRICT)
// - the exception is a product on invoice lines: the line keeps its own copy of code, name and
//   price, so the product can be deleted and the line just loses the link (SET NULL)
// - a worksheet that is on an invoice line cannot be deleted until the line is gone. The API
//   removes the line itself while the invoice is still open, and refuses once it is locked.
//
// "None" used to be stored as 0 in worksheets.invoice and as 0 in a few other columns; a foreign key
// needs NULL, so those zeros become NULL first (the API now writes NULL).
//
// Stops with a list if a row points at something that does not exist: whether to restore the
// missing row, point the row elsewhere or delete it is a decision for a person. Every step checks
// what exists first, so this is safe on a fresh install and on a second run, on MySQL and MariaDB.

const { hasForeignKey, refuseOrphans } = require("../config/migrationHelpers");

const foreignKeys = [
    {
        table: "invoices",
        name: "fk_invoices_customer",
        column: "customer_id",
        parent: "customers",
        onDelete: "RESTRICT"
    },
    {
        table: "invoice_items",
        name: "fk_items_invoice",
        column: "invoice_id",
        parent: "invoices",
        onDelete: "RESTRICT"
    },
    {
        table: "invoice_items",
        name: "fk_items_product",
        column: "product_id",
        parent: "products",
        onDelete: "SET NULL"
    },
    {
        table: "invoice_items",
        name: "fk_items_worksheet",
        column: "worksheet_id",
        parent: "worksheets",
        onDelete: "RESTRICT"
    },
    {
        table: "worksheets",
        name: "fk_worksheets_customer",
        column: "customer_id",
        parent: "customers",
        onDelete: "RESTRICT"
    },
    {
        table: "worksheets",
        name: "fk_worksheets_product",
        column: "product_id",
        parent: "products",
        onDelete: "RESTRICT"
    },
    {
        table: "worksheets",
        name: "fk_worksheets_invoice",
        column: "invoice",
        parent: "invoices",
        onDelete: "RESTRICT"
    }
];

exports.up = async (db) => {
    // "None" is NULL, not 0
    await db.runSql(`ALTER TABLE worksheets MODIFY invoice INT DEFAULT NULL;`);
    await db.runSql(`ALTER TABLE invoice_items MODIFY product_id INT DEFAULT NULL;`);

    await db.runSql(`UPDATE worksheets SET invoice = NULL WHERE invoice = 0;`);
    await db.runSql(`UPDATE invoice_items SET worksheet_id = NULL WHERE worksheet_id = 0;`);
    await db.runSql(`UPDATE invoice_items SET product_id = NULL WHERE product_id = 0;`);
    await db.runSql(`UPDATE invoices SET customer_id = NULL WHERE customer_id = 0;`);

    for (const { table, column, parent } of foreignKeys) {
        await refuseOrphans(db, { table, column, parent });
    }

    for (const { table, name, column, parent, onDelete } of foreignKeys) {
        if (!(await hasForeignKey(db, table, name))) {
            await db.runSql(`
                ALTER TABLE ${table}
                    ADD CONSTRAINT ${name} FOREIGN KEY (${column})
                        REFERENCES ${parent} (id) ON DELETE ${onDelete};
            `);
        }
    }
};

// Not reversible on purpose: dropping the keys would allow orphan rows again, and on fresh
// installs they belong to the base schema.
exports.down = async () => {};

exports._meta = {
    version: 1
};
