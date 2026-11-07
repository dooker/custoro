"use strict";

// A paid (locked) invoice showed and printed its customer as the customer is now: when a customer
// moved, changed name or VAT number, every old invoice's PDF changed with it, although an invoice
// is a record of what was billed to whom. The due date came from the customer's current payment
// period the same way.
//
// Invoices now keep a copy of the customer details they print (name, registration and VAT number,
// address, phone, email, department and payment period). The API takes the copy when an invoice is
// marked as paid; until then an invoice follows its customer, as before. This migration adds the
// columns and fills them for the invoices that are already paid, from the customers as they are
// now, which is the best that is known.
//
// Every step checks what exists first, so this is safe on a fresh install (db/01-schema.sql already
// has the columns) and on a second run, on MySQL 8.4 and MariaDB 11.4. The copy is only filled in
// for paid invoices that have none yet, so a second run changes nothing.

const { getColumn } = require("../config/migrationHelpers");

// Each the same type as its column in customers, NULL when there is no copy
const columns = [
    ["customer_name", "VARCHAR(150) DEFAULT NULL", "name"],
    ["customer_reg_number", "VARCHAR(150) DEFAULT NULL", "reg_number"],
    ["customer_vat_number", "VARCHAR(50) DEFAULT NULL", "vat_number"],
    ["customer_address", "VARCHAR(250) DEFAULT NULL", "address"],
    ["customer_phone", "VARCHAR(45) DEFAULT NULL", "phone"],
    ["customer_email", "VARCHAR(254) DEFAULT NULL", "email"],
    ["customer_department", "VARCHAR(250) DEFAULT NULL", "department"],
    ["customer_payment_period", "INT DEFAULT NULL", "payment_period"]
];

exports.up = async (db) => {
    const missing = [];

    for (const [column, definition] of columns) {
        if (!(await getColumn(db, "invoices", column))) {
            missing.push(`ADD COLUMN ${column} ${definition}`);
        }
    }

    // One statement, so the table is changed once
    if (missing.length) {
        await db.runSql(`ALTER TABLE invoices ${missing.join(", ")};`);
    }

    await db.runSql(`
        UPDATE invoices
            JOIN customers ON customers.id = invoices.customer_id
        SET ${columns.map(([column, , source]) => `invoices.${column} = customers.${source}`).join(",\n            ")}
        WHERE invoices.locked = 1
          AND ${columns.map(([column]) => `invoices.${column} IS NULL`).join("\n          AND ")};
    `);
};

// Not reversible on purpose: dropping the columns would lose the details the paid invoices were
// billed with, and on fresh installs the columns belong to the base schema.
exports.down = async () => {};

exports._meta = {
    version: 1
};
