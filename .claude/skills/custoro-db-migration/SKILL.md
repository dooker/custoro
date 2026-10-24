---
name: custoro-db-migration
description: Add or change a Custoro database migration safely, and prove it with a schema-drift check on MySQL 8.4 and MariaDB 11.4. Use when asked to "add a migration", "change the schema", "add a column / index / foreign key / unique key", "migrate the hosted database", "does this work on MariaDB", "check for schema drift", "generate test data / 50k invoices", or "write the deploy notes for a migration". Includes scripts/schema-drift.sh and scripts/gen-volume.sql.
---

# Custoro database migration

Production runs MySQL 8.4; the hosted database is MariaDB 11.4. A migration must run on both, on an existing database, on a fresh install and a second time, and the result must equal a fresh install of `apps/api/db/01-schema.sql`.

## Steps

1. **Name the file** `apps/api/migrations/<YYYYMMDDHHMMSS>-<what-it-does>.js`, later than the newest one (`ls apps/api/migrations`). Start from [references/migration-template.js](references/migration-template.js). CommonJS, `exports.up = async (db) => {...}`, `db.runSql(...)`. Connections allow several statements in a migration (not in the API).
2. **Make it idempotent** with `apps/api/config/migrationHelpers.js` (reads `information_schema`): `getColumn`, `hasIndex`, `hasForeignKey`, `getTableCollation`, `addIndexIfMissing`, `dropIndexIfPresent`, `refuseDuplicates`, `refuseOrphans`. Names in SQL are constants written in the migration, never input. MySQL DDL does not roll back, so refuse bad data **before** the first change.
3. **Portable SQL.** Use `utf8mb4_unicode_ci` (the hosted MariaDB 11.4 has no `utf8mb4_0900_*`; newer 11.4 patches do, so the drift check cannot catch a use: `grep -rn 0900 apps/api/migrations apps/api/db` must print nothing), no `ADD COLUMN IF NOT EXISTS` (MariaDB only: use the helpers), explicit constraint names (`fk_<table>_<thing>`). More in [references/portability.md](references/portability.md).
4. **Migrations that tighten data stop with a list** of the duplicate or orphan rows (or catch `ER_DUP_ENTRY` and say which rows) instead of choosing one. The message ends with "Change or remove the extra rows by hand, then run the migration again."
5. **`down` is a no-op** (`exports.down = async () => {}`) with a comment saying why: going back would allow bad data again, and on fresh installs the change belongs to the base schema.
6. **Update the base files.** `apps/api/db/01-schema.sql` must describe exactly what the migrations leave. `apps/api/db/demo/demo-data.sql` must still load: insert order follows the foreign keys (customers and products, then invoices, then worksheets, then invoice lines). A new top-level file in `apps/api/db/` also goes into the `db` volumes list of `docker-compose.yml` (production mounts the whole folder).
7. **Change the API** for the new schema in the same PR (a query that reads rows by position broke when a new index changed the row order; match by name, not position).
8. **Prove it**:
   - Drift on both engines (needs Docker, git; about a minute; uses throwaway containers):
     ```bash
     .claude/skills/custoro-db-migration/scripts/schema-drift.sh
     ```
     It loads the new `01-schema.sql` into one database and the previous schema (`PREVIOUS=<git ref>`, default the merge base with `origin/main`) plus every migration into another, then diffs tables, columns (type, null, default, collation, generated expression), indexes and foreign keys. It also checks that row counts survive, that running the migrations a second time and on a fresh install changes nothing, and prints how long the upgrade took. Exit 1 on any difference.
   - On data: `PREVIOUS=57d68b1 SEED_SQL=$PWD/.claude/skills/custoro-db-migration/scripts/gen-volume.sql .claude/skills/custoro-db-migration/scripts/schema-drift.sh` upgrades 50k invoices from an older schema (10 s on MySQL, 8 s on MariaDB for the 2026-10-19 set). `PREVIOUS` must be the release before your change.
   - Does it stop correctly? Load rows that break the new rule into the previous schema with `SEED_SQL=<file>` and confirm the script shows your list.
   - Locally: `docker compose exec -T api npm run migrate:up` (migrates `DB_NAME`; names are stored in the `migrations` table). If `apps/api/.env.development` exists (the host setup of the README), it overrides `DB_HOST` inside the container and the connection fails: move the file away or run the migrations from the host.
   - API tests after: `apps/web/tests/database.api.spec.ts` via the Playwright `api` project (dev-stack skill).
9. **CHANGELOG** entry under `## Unreleased` > `### Security`/`### Fixed`/`### Changed`, with the line **Existing databases must run the new migration** and what it stops on (see the 2026-10-09 and 2026-10-19 entries).

## Test data

`scripts/gen-volume.sql` fills a database that already has the schema and seed with 2000 customers, 500 products, 50 000 invoices, 250 000 lines and 100 000 worksheets (1 in 5 unbilled), about 3 s on either engine. It works on the current schema and the one before 2026-10-19, continues ids and invoice numbers after existing rows (demo data stays), and sets `config.lastInvoiceId`. Other sizes: `(echo "SET @vol_invoices = 5000;"; cat gen-volume.sql) | ...` (also `@vol_customers`, `@vol_products`, `@vol_lines`, `@vol_worksheets`). Never on real data. MariaDB needs `max_recursive_iterations` where MySQL needs `cte_max_recursion_depth`; the script picks the right one.

## Deploy notes to put in the PR and the CHANGELOG

- **Take a backup first**: `mysqldump --single-transaction <database> > backup.sql`. The migrations cannot undo a structure change.
- Say whether the old API can still run on the new schema. If not: stop the API, migrate, start the new API.
- The database user needs `ALTER`, `INDEX`, `REFERENCES`, `UPDATE` (and `CREATE` for the `migrations` table).
- Run from a checkout with dependencies (Node 24, or the `api` container): `cd apps/api && NODE_ENV=production npm run migrate:up`. Production verifies the database's TLS certificate; set `DB_SSL_CA` or `DB_SSL=off` as `apps/api/db/README.md` explains.
- If a migration stops with a list: fix those rows by hand and run `migrate:up` again. Files that already ran stay applied and are skipped.
- Migrating the hosted database is the owner's action: prepare the commands, do not run them.
