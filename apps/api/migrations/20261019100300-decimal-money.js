"use strict";

// Prices, quantities and the VAT rate were FLOAT (binary floating point), which cannot hold most
// decimal amounts exactly: 19.99 is stored as 19.9899997711..., so 3 x 19.99 is 59.96999931 and
// does not equal 59.97. They are DECIMAL now, which stores the digits as written.
//
// - prices: DECIMAL(12,4), the four decimals the API already rounded to
// - quantities: DECIMAL(12,3), enough for hours in minutes and fractions of a unit
// - invoices.vat: DECIMAL(5,2), a rate in percent (it was a whole-number TINYINT)
//
// A FLOAT keeps about 7 significant digits, so converting rounds to the new number of decimals
// and loses nothing that was stored accurately. Columns that are already DECIMAL are left alone,
// which makes this safe on a fresh install and on a second run, on MySQL and MariaDB.

const { getColumn } = require("../config/migrationHelpers");

const conversions = [
    { table: "products", column: "price", from: "float", to: "DECIMAL(12,4) NOT NULL" },
    { table: "products", column: "discount_price", from: "float", to: "DECIMAL(12,4) NOT NULL" },
    { table: "invoice_items", column: "price", from: "float", to: "DECIMAL(12,4) NOT NULL" },
    {
        table: "invoice_items",
        column: "discount_price",
        from: "float",
        to: "DECIMAL(12,4) NOT NULL"
    },
    { table: "invoice_items", column: "quantity", from: "float", to: "DECIMAL(12,3) NOT NULL" },
    { table: "worksheets", column: "quantity", from: "float", to: "DECIMAL(12,3) NOT NULL" },
    { table: "invoices", column: "vat", from: "tinyint", to: "DECIMAL(5,2) NOT NULL" }
];

exports.up = async (db) => {
    for (const { table, column, from, to } of conversions) {
        const current = await getColumn(db, table, column);

        if (current?.dataType === from) {
            await db.runSql(`ALTER TABLE ${table} MODIFY ${column} ${to};`);
        }
    }
};

// Not reversible on purpose: going back to FLOAT would bring the rounding errors back, and on
// fresh installs the DECIMAL columns belong to the base schema.
exports.down = async () => {};

exports._meta = {
    version: 1
};
