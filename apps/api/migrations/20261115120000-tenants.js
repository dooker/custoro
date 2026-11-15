"use strict";

// Several companies ("tenants") in one install (docs/multi-tenant.md). Every company row gets a
// tenant_id, people belong to one company (users.tenant_id, with their role in it), and the
// install has one owner (users.owner) who manages the companies. The data that is there becomes
// company 1, named after the company name in the settings, and its first admin becomes the owner,
// so an existing install keeps working without a step by hand.
//
// The keys follow the company: invoice numbers, product codes and setting names are unique per
// company, indexes start with tenant_id, and references include it, so the database refuses an
// invoice of one company that points at a customer of another. One reference stays on its own:
// invoice_items.product_id is ON DELETE SET NULL, which on a two-column key would also clear
// tenant_id; the API checks it and the SQL test covers it.
//
// Every step checks what exists first, so this is safe on a fresh install (db/01-schema.sql already
// has all of it) and on a second run, on MySQL 8.4 and MariaDB 11.4. tenant_id gets no default once
// the rows are filled: an insert that forgets it fails instead of landing in some company.

const { getColumn, hasIndex, hasForeignKey } = require("../config/migrationHelpers");

// The company tables, in the order their keys depend on each other
const companyTables = [
    "config",
    "customers",
    "products",
    "invoices",
    "worksheets",
    "invoice_items"
];

// Unique keys and indexes that change: [table, old name or null, new name, new definition]
const keys = [
    ["config", "name_UNIQUE", "uq_config_name", "UNIQUE KEY uq_config_name (tenant_id, name)"],
    [
        "customers",
        null,
        "uq_customers_tenant_id",
        "UNIQUE KEY uq_customers_tenant_id (tenant_id, id)"
    ],
    ["products", null, "uq_products_tenant_id", "UNIQUE KEY uq_products_tenant_id (tenant_id, id)"],
    [
        "products",
        "code_UNIQUE",
        "uq_products_code",
        "UNIQUE KEY uq_products_code (tenant_id, code)"
    ],
    ["invoices", null, "uq_invoices_tenant_id", "UNIQUE KEY uq_invoices_tenant_id (tenant_id, id)"],
    [
        "invoices",
        "number_UNIQUE",
        "uq_invoices_number",
        "UNIQUE KEY uq_invoices_number (tenant_id, number)"
    ],
    [
        "invoices",
        "idx_invoices_customer",
        "idx_invoices_customer",
        "KEY idx_invoices_customer (tenant_id, customer_id)"
    ],
    [
        "invoices",
        "idx_invoices_number_sort",
        "idx_invoices_number_sort",
        "KEY idx_invoices_number_sort (tenant_id, number_sort)"
    ],
    [
        "worksheets",
        null,
        "uq_worksheets_tenant_id",
        "UNIQUE KEY uq_worksheets_tenant_id (tenant_id, id)"
    ],
    [
        "worksheets",
        "idx_worksheets_customer",
        "idx_worksheets_customer",
        "KEY idx_worksheets_customer (tenant_id, customer_id, id)"
    ],
    [
        "worksheets",
        "idx_worksheets_invoice",
        "idx_worksheets_invoice",
        "KEY idx_worksheets_invoice (tenant_id, invoice)"
    ],
    [
        "worksheets",
        "idx_worksheets_product",
        "idx_worksheets_product",
        "KEY idx_worksheets_product (tenant_id, product_id)"
    ],
    [
        "invoice_items",
        "idx_items_invoice",
        "idx_items_invoice",
        "KEY idx_items_invoice (tenant_id, invoice_id)"
    ],
    [
        "invoice_items",
        "idx_items_worksheet",
        "idx_items_worksheet",
        "KEY idx_items_worksheet (tenant_id, worksheet_id)"
    ],
    ["users", null, "idx_users_tenant", "KEY idx_users_tenant (tenant_id)"]
];

// References that now include the company: [table, name, columns, parent, parent columns, on delete]
const references = [
    [
        "invoices",
        "fk_invoices_customer",
        "tenant_id, customer_id",
        "customers",
        "tenant_id, id",
        "RESTRICT"
    ],
    [
        "worksheets",
        "fk_worksheets_customer",
        "tenant_id, customer_id",
        "customers",
        "tenant_id, id",
        "RESTRICT"
    ],
    [
        "worksheets",
        "fk_worksheets_product",
        "tenant_id, product_id",
        "products",
        "tenant_id, id",
        "RESTRICT"
    ],
    [
        "worksheets",
        "fk_worksheets_invoice",
        "tenant_id, invoice",
        "invoices",
        "tenant_id, id",
        "RESTRICT"
    ],
    [
        "invoice_items",
        "fk_items_invoice",
        "tenant_id, invoice_id",
        "invoices",
        "tenant_id, id",
        "RESTRICT"
    ],
    [
        "invoice_items",
        "fk_items_worksheet",
        "tenant_id, worksheet_id",
        "worksheets",
        "tenant_id, id",
        "RESTRICT"
    ]
];

// Whether a foreign key already covers the given columns (a second run, or a fresh install)
const foreignKeyColumns = async (db, table, name) => {
    const rows = await db.runSql(`
        SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION SEPARATOR ', ') AS columns
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = '${table}'
          AND CONSTRAINT_NAME = '${name}'
          AND REFERENCED_TABLE_NAME IS NOT NULL;
    `);
    return rows[0]?.columns ?? null;
};

// The columns of an index, to tell an old one from its replacement of the same name
const indexColumns = async (db, table, name) => {
    const rows = await db.runSql(`
        SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ', ') AS columns
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = '${table}'
          AND INDEX_NAME = '${name}';
    `);
    return rows[0]?.columns ?? null;
};

exports.up = async (db) => {
    // 1. The companies
    await db.runSql(`
        CREATE TABLE IF NOT EXISTS tenants (
            id int NOT NULL AUTO_INCREMENT,
            name varchar(150) NOT NULL,
            active tinyint(1) NOT NULL DEFAULT 1,
            created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_tenants_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Company 1 holds what is there, named after the company in the settings. The setting may
    // hold 250 characters and the name 150: the name in the companies list is cut, the setting
    // itself (on the invoices) stays whole (Copilot review of PR 40)
    await db.runSql(`
        INSERT INTO tenants (id, name)
        SELECT 1, COALESCE(
            (SELECT NULLIF(TRIM(LEFT(TRIM(value), 150)), '') FROM config WHERE name = 'companyName' LIMIT 1),
            'Company 1'
        )
        FROM DUAL
        WHERE NOT EXISTS (SELECT 1 FROM tenants);
    `);

    // 3. tenant_id on every company row and on every person, filled with company 1, then without
    // a default
    for (const table of [...companyTables, "users"]) {
        if (!(await getColumn(db, table, "tenant_id"))) {
            await db.runSql(
                `ALTER TABLE ${table} ADD COLUMN tenant_id int NOT NULL DEFAULT 1 AFTER id;`
            );
        }
        await db.runSql(`ALTER TABLE ${table} ALTER COLUMN tenant_id DROP DEFAULT;`);
    }

    // 4. The owner of the install: the first admin of company 1
    if (!(await getColumn(db, "users", "owner"))) {
        await db.runSql(
            `ALTER TABLE users ADD COLUMN owner tinyint(1) NOT NULL DEFAULT 0 AFTER role;`
        );
    }
    await db.runSql(`
        UPDATE users
        SET owner = 1
        WHERE id = (
            SELECT id FROM (
                SELECT MIN(id) AS id FROM users WHERE tenant_id = 1 AND role = 'admin'
            ) AS first_admin
        )
          AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM users WHERE owner = 1) AS owners);
    `);

    // 5. The old references go first: they hold on to the indexes that change
    for (const [table, name, columns] of references) {
        const current = await foreignKeyColumns(db, table, name);
        if (current && current !== columns) {
            await db.runSql(`ALTER TABLE ${table} DROP FOREIGN KEY ${name};`);
        }
    }

    // 6. Keys and indexes by company
    for (const [table, oldName, newName, definition] of keys) {
        const wanted = definition.match(/\(([^)]+)\)$/)[1];
        if (oldName && (await hasIndex(db, table, oldName))) {
            if (oldName === newName && (await indexColumns(db, table, oldName)) === wanted) {
                continue;
            }
            await db.runSql(`ALTER TABLE ${table} DROP INDEX ${oldName};`);
        }
        if (!(await hasIndex(db, table, newName))) {
            await db.runSql(`ALTER TABLE ${table} ADD ${definition};`);
        }
    }

    // 7. Every company row and person points at its company
    for (const table of [...companyTables, "users"]) {
        const name = `fk_${table === "invoice_items" ? "items" : table}_tenant`;
        if (!(await hasForeignKey(db, table, name))) {
            await db.runSql(`
                ALTER TABLE ${table}
                ADD CONSTRAINT ${name} FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;
            `);
        }
    }

    // 8. References within one company
    for (const [table, name, columns, parent, parentColumns, onDelete] of references) {
        if (!(await hasForeignKey(db, table, name))) {
            await db.runSql(`
                ALTER TABLE ${table}
                ADD CONSTRAINT ${name} FOREIGN KEY (${columns})
                REFERENCES ${parent} (${parentColumns}) ON DELETE ${onDelete};
            `);
        }
    }
};

// Not reversible on purpose: going back would merge the companies' data again, and on fresh
// installs all of this belongs to the base schema.
exports.down = async () => {};

exports._meta = {
    version: 1
};
