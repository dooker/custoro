"use strict";

// Checks shared by the migrations. Each one reads information_schema, so a migration can run on
// a fresh install (where db/01-schema.sql already has the change), on an existing database and a
// second time, on MySQL and on MariaDB. Table, column and index names are constants written in
// the migrations, never input, so they are put into the SQL as they are.

const inSchema = (table) => `TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}'`;

const first = async (db, sql) => (await db.runSql(sql))[0];

const getColumn = (db, table, column) =>
    first(
        db,
        `SELECT DATA_TYPE AS dataType,
                COLUMN_TYPE AS columnType
         FROM information_schema.COLUMNS
         WHERE ${inSchema(table)}
           AND COLUMN_NAME = '${column}'`
    );

const hasIndex = async (db, table, index) =>
    !!(await first(
        db,
        `SELECT 1 AS found
         FROM information_schema.STATISTICS
         WHERE ${inSchema(table)}
           AND INDEX_NAME = '${index}'
         LIMIT 1`
    ));

const hasForeignKey = async (db, table, name) =>
    !!(await first(
        db,
        `SELECT 1 AS found
         FROM information_schema.TABLE_CONSTRAINTS
         WHERE ${inSchema(table)}
           AND CONSTRAINT_TYPE = 'FOREIGN KEY'
           AND CONSTRAINT_NAME = '${name}'`
    ));

const getTableCollation = async (db, table) =>
    (
        await first(
            db,
            `SELECT TABLE_COLLATION AS collation
             FROM information_schema.TABLES
             WHERE ${inSchema(table)}`
        )
    )?.collation;

// definition is what follows ADD, e.g. "UNIQUE KEY name_UNIQUE (name)" or "INDEX idx_a (a)"
const addIndexIfMissing = async (db, table, index, definition) => {
    if (!(await hasIndex(db, table, index))) {
        await db.runSql(`ALTER TABLE ${table} ADD ${definition}`);
    }
};

const dropIndexIfPresent = async (db, table, index) => {
    if (await hasIndex(db, table, index)) {
        await db.runSql(`ALTER TABLE ${table} DROP INDEX ${index}`);
    }
};

// Stops with the groups that share a value, so a person can decide which row to keep
const refuseDuplicates = async (db, { table, columns, what }) => {
    const list = columns.join(", ");
    const duplicates = await db.runSql(
        `SELECT ${list},
                COUNT(*) AS copies,
                GROUP_CONCAT(id ORDER BY id) AS ids
         FROM ${table}
         WHERE ${columns.map((column) => `${column} IS NOT NULL`).join(" AND ")}
         GROUP BY ${list}
         HAVING COUNT(*) > 1`
    );

    if (duplicates.length) {
        const shown = duplicates
            .slice(0, 20)
            .map(
                (row) => `${columns.map((column) => `"${row[column]}"`).join("/")} (ids ${row.ids})`
            )
            .join("; ");

        throw new Error(
            `${what} must be unique, but ${duplicates.length} value(s) are used more than once in ` +
                `${table}: ${shown}. Change or remove the extra rows by hand, then run the migration again.`
        );
    }
};

// Stops with the rows that point at a parent that does not exist, since which is right (restore
// the parent, point the row elsewhere, remove the row) is a decision for a person
const refuseOrphans = async (db, { table, column, parent }) => {
    const orphans = await db.runSql(
        `SELECT child.id AS id,
                child.${column} AS value
         FROM ${table} AS child
                  LEFT JOIN ${parent} AS parent ON parent.id = child.${column}
         WHERE child.${column} IS NOT NULL
           AND parent.id IS NULL
         ORDER BY child.id
         LIMIT 20`
    );

    if (orphans.length) {
        const shown = orphans.map((row) => `${table}.id ${row.id} -> ${row.value}`).join("; ");

        throw new Error(
            `${table}.${column} points at ${parent} rows that do not exist (first ${orphans.length}): ` +
                `${shown}. Fix these rows by hand, then run the migration again.`
        );
    }
};

module.exports = {
    getColumn,
    hasIndex,
    hasForeignKey,
    getTableCollation,
    addIndexIfMissing,
    dropIndexIfPresent,
    refuseDuplicates,
    refuseOrphans
};
