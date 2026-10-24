---
name: custoro-perf-check
description: Measure and compare query speed in Custoro on the 50k-invoice dataset, on MySQL 8.4 and MariaDB 11.4, and produce the Before / After table for a PR. Use when asked to "check performance", "is this query fast", "benchmark the invoice list", "compare before and after", "find slow queries", "do I need an index", "EXPLAIN ANALYZE this", or after changing a getter in routes/_getters.ts or a migration that adds indexes. Includes scripts/explain-bench.sh.
---

# Custoro performance check

PRs 6 and 7 measured by hand: generated data, `EXPLAIN ANALYZE`, the median of 6 warm runs, before and after, on both servers, and a check that old and new queries return the same rows. This skill makes that repeatable. Measure on the same machine, server version and data, in one sitting: absolute numbers do not travel between machines.

## 1. Data

A private project with 2000 customers, 500 products, 50 000 invoices, 250 000 lines and 100 000 worksheets (`custoro-dev-stack` and `custoro-db-migration` have the commands):

```bash
DB_PORT=3316 docker compose -p custoro-perf up -d --build --wait db api
docker compose -p custoro-perf exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < .claude/skills/custoro-db-migration/scripts/gen-volume.sql
```

For MariaDB start a container, wait until it answers (the image restarts once while it initializes), create the database `custoro` and load `db/01-schema.sql`, `db/02-seed.sql` and `gen-volume.sql` into it. The statements are plain SQL, so the same file runs on both:

```bash
docker run -d --rm --name perf-ma -e MARIADB_ROOT_PASSWORD=custoro mariadb:11.4
until docker exec perf-ma bash -c 'exec 3<>/dev/tcp/127.0.0.1/3306' 2>/dev/null; do sleep 1; done   # the final server listens on TCP; /dev/tcp needs bash, not sh
M="docker exec -i -e MYSQL_PWD=custoro perf-ma mariadb -uroot"
$M -e 'CREATE DATABASE custoro'
for f in apps/api/db/01-schema.sql apps/api/db/02-seed.sql .claude/skills/custoro-db-migration/scripts/gen-volume.sql; do $M custoro < $f; done
```

## 2. Statements

[references/statements.example.sql](references/statements.example.sql) holds the statements of the list and detail screens (captured at `dbdeeda`). Copy it. When a getter changed, **recapture the statement the API really sends** instead of rewriting it by hand. The pool interpolates values client-side, so the server sees the final SQL:

```bash
docker compose -p custoro-perf exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "UPDATE performance_schema.setup_consumers SET ENABLED=\"YES\" WHERE NAME=\"events_statements_history_long\"; TRUNCATE performance_schema.events_statements_history_long"'
# call the endpoint with a token (custoro-security-review/references/probes.md), e.g.
curl -s "http://localhost:3999/invoices/1?page=1350&limit=20" -H "Authorization: Bearer $ADMIN" >/dev/null
docker compose -p custoro-perf exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -B --raw -e "SELECT SQL_TEXT FROM performance_schema.events_statements_history_long WHERE CURRENT_SCHEMA=\"custoro\" AND SQL_TEXT NOT LIKE \"%performance_schema%\" AND SQL_TEXT NOT LIKE \"select @@%\" ORDER BY EVENT_ID"'
```

`--raw` matters: without it the client prints every newline of a multi-line statement as the two characters `\n`, and the scan refuses a backslash outside quotes. With it the statement comes out as the API sent it, indented, and that is accepted. Add a `;` at the end and a `-- name:` line above, and check the file with `$B check` before running it (checked on the invoice list: the real, indented statement passes and runs).

Paging is `?page=&limit=` on `/invoices/1` and `/worksheets/1` (the id in the path is not a page). Put each statement under a `-- name:` line, one `SELECT` ending in `;`.

## 3. Measure

```bash
B=.claude/skills/custoro-perf-check/scripts/explain-bench.sh
$B run -p custoro-perf statements.sql after.tsv         # MySQL: EXPLAIN ANALYZE, median of 6 warm runs
$B run -c perf-ma statements.sql after-maria.tsv        # MariaDB container: ANALYZE FORMAT=JSON
```

`-p` is a compose project (its `db` service), `-c` a container, `-d` the database, `-n` the number of timed runs. The statements really run, so the script fences them in layers, and the last two are the boundary:

1. A scan of the file (`$B check statements.sql`, no database needed) refuses a second statement, write or file words, comments and backslashes outside quotes. It catches mistakes and the obvious. It is a word list over text, so it is not the boundary.
2. The statements run as a throwaway database user that has `SELECT` on the one database and nothing else: no `FILE` (so no `INTO OUTFILE`, `DUMPFILE` or `LOAD_FILE`), no write, no stored routine, no `SET GLOBAL`. It is created for the run with a random name and password, so two runs at the same time on one container do not touch each other's account, and dropped at the end; `$B drop-users -c <container>` removes any that a killed run left behind. The database-level grant escapes `_`, so `-d custoro_test` does not open `custoroXtest` too. This is enforced by the server.
3. Every session has a fixed SQL mode and is `READ ONLY`, and the client runs with `--binary-mode=1`, so it ignores its own backslash commands.

`$B privileges -c <container>` proves layer 2 on a server (15 checks with an underscore in the database name, 14 without, among them `INTO OUTFILE`, `LOAD_FILE`, `INSERT`, `CREATE TABLE`, `GRANT`, `SET GLOBAL` and the `mysql` schema); run it on a new server version or after touching the user setup. It prints the table and saves a TSV. A label (the text after `-- name:`) is only printed, never sent to the server. `scripts/selftest.sh` (no database) tests the scan: every word of its list plus the hostile and harmless statements it must refuse or accept. Run it after any change to the scan. A constant `SELECT` on MariaDB has no executor time and shows `n/a`, which `compare` keeps.

**Before and after.** Capture the _before_ statements from `main` (`git switch --detach main` in the worktree, since `main` is checked out elsewhere, and switch back afterwards; the api container restarts on change) and the _after_ statements from the branch, then:

```bash
$B digest -p custoro-perf before.sql; $B digest -p custoro-perf after.sql     # same rows and checksum per label?
$B compare before.tsv after.tsv                                                 # the PR table
```

`digest` prints rows and a checksum of every result: a rewrite that changes a checksum changed the answer (give the statements an `ORDER BY` that decides the order). Run both versions on MySQL and MariaDB, as PR 7 did for about 30 page and filter combinations.

## 4. Read the result

- Executor time is the database's own number without the client round trip (PR 7 quoted MariaDB as wall clock including about 3.5 ms of round trip, so its figures are higher). Do not compare MySQL with MariaDB; compare each with itself.
- A statement far above [references/baseline.md](references/baseline.md) for the same data is a regression to look at. Those numbers are from one machine on 2026-10-24: re-measure `main` first, on your machine.
- Find the reason with plain `EXPLAIN <statement>`: the `key` column (is the index used, `idx_invoices_number_sort`, `idx_worksheets_customer`), `rows`, `Using filesort`, `Using temporary`. Rows examined far above rows sent is the sign of a scan: `custoro-security-review/references/probes.md` has the `performance_schema` digest query (`SUM_ROWS_EXAMINED` against `SUM_ROWS_SENT`, `SUM_NO_INDEX_USED`).
- A deep page (`LIMIT 26980, 20`) and a keyword search (`LIKE '%word%'`, no index can help) are the known expensive ones. The list pickers return up to 1000 rows by design.
- A new index needs a migration (`custoro-db-migration`); measure before and after it with the same file.

## 5. Report

Paste the table into the PR's **Why** section with its conditions, as PRs 6 and 7 did: `(50 000 invoices, MySQL 8.4, EXPLAIN ANALYZE, median of 6 warm runs, executor time)`, say which server each number is from, and say when a claimed gain could not be reproduced. Clean up: `docker compose -p custoro-perf down -v`, `docker stop perf-ma`.
