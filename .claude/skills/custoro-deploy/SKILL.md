---
name: custoro-deploy
description: Prepare a Custoro production deploy as a runbook: pre-flight checks, backup, migrations, image rebuild, verification and rollback. It prepares and never runs anything on the live server or the hosted database. Use only when the user asks to "deploy", "release", "ship to production", "update the live server", "migrate the hosted database" or "write the deploy notes".
disable-model-invocation: true
---

# Custoro deploy: prepare, do not run

**The owner runs everything that touches the live server or the hosted database.** Do not ssh to it, connect to the hosted database, run migrations there, push images or run `docker compose` against production. Prepare a runbook with real commands and the pre-flight result, and hand it over. What may be run here: the pre-flight and a rehearsal on a local copy. Never print values from an `.env` file or put a secret into a runbook: use placeholders.

## 0. Ask only what the repo does not say

- The commit or tag that runs now (`git log <it>..main` is the change set).
- Docker (`docker-compose.prod.yml`: db, api, nginx web) or the API without Docker (`apps/api/.env.production`, `npm run build`, `npm start`, web built with `VITE_API_ENDPOINT`).
- How the database is reached: host name (TLS verification needs a name, not an IP), `DB_SSL` / `DB_SSL_CA`, or an SSH tunnel with `DB_SSL=off`. The hosted database is MariaDB 11.4; the compose file's own is MySQL 8.4.
- How many proxies stand in front of the API (`TRUST_PROXY`: 1 nginx directly, 2 with a TLS proxy such as Caddy), and whether images come from a registry (`API_IMAGE`, `WEB_IMAGE`).

## 1. Pre-flight

```bash
.claude/skills/custoro-deploy/scripts/preflight.sh <env file> --deployed <commit or tag on the server>
# without Docker: ... apps/api/.env.production --no-docker
```

It reads files only. It checks the tree and branch, every variable `docker-compose.prod.yml` requires (set in the env file **and** in the CI docker job), `JWT_SECRET` of at least 32 characters, `TRUST_PROXY`, `APP_ORIGIN`, that compose resolves; then lists the migrations added since the deployed commit, which images need a rebuild (the web image copies `CHANGELOG.md`, so it almost always does) and the bold deploy actions of the changelog. Fix every FAIL before going on. Put its output in the runbook.

## 2. Rehearse a migration

Restore a dump of the live database into a scratch `mariadb:11.4` container and run the migrations on it (the command in step 4, with `DB_SSL=off`). A migration that tightens data stops with a list of the rows; that is where to find them, not on the live server. Compare row counts before and after. PR 6 did this on a dump of the hosted database: nothing stopped, counts and money totals unchanged.

## 3. Backup

- The database: `mysqldump --single-transaction <database> > backup-<date>.sql` (`mariadb-dump` on MariaDB). The structure changes of the migrations cannot be undone, so the dump is the way back. Check that it is not empty and restore it once into the scratch container.
- The volumes `uploads` and `invoices` (README: back up `dbdata`, `uploads` and `invoices`). On the compose project `custoro`: `docker run --rm -v custoro_uploads:/data -v "$PWD":/backup alpine tar czf /backup/uploads.tgz -C /data .`, and the same for `custoro_invoices`.
- When migrating, stop the API **before** the dump so nothing is written after it.

## 4. Order of work

With migrations (the old API cannot run on the new schema, the new API needs the new columns):

1. Backup (stop the API first). 2. Build or pull the new images. 3. Migrate. 4. Start the new API and web. 5. Verify.

Without migrations: build, `docker compose -f docker-compose.prod.yml up -d`, verify.

**Migrating.** The production API image has no `db-migrate` (a dev dependency), so run it from a checkout with `npm ci` (Node 24, or inside the `api` container) or from the dev image:

```bash
cd apps/api && NODE_ENV=production npm run migrate:up        # a checkout with dependencies
# or, anywhere with Docker (tested against MariaDB 11.4); db.env holds DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME, DB_SSL / DB_SSL_CA
docker build -q --target dev -t custoro-migrate apps/api
docker run --rm -v "$PWD/apps/api/config:/app/config:ro" -v "$PWD/apps/api/migrations:/app/migrations:ro" \
  -v "$PWD/apps/api/scripts:/app/scripts:ro" --env-file db.env -e NODE_ENV=production \
  custoro-migrate node scripts/migrate.js up
```

Production mode verifies the database certificate (`apps/api/db/README.md`). The database user needs `ALTER`, `INDEX`, `REFERENCES` and `UPDATE`, and `CREATE` for the `migrations` table. If a migration stops with a list, fix those rows by hand and run it again: files that finished stay applied and are skipped. The hosted database's `migrations` table (`SELECT name FROM migrations`) shows what ran; names are stored with a leading slash.

If migration `20261009180000-secure-password-reset` has not run yet on a database that still has finished reset tokens, run `UPDATE users SET forgot_token = NULL WHERE forgot_token = '';` first (PR 3's deploy notes).

## 5. Verify

- `curl -s https://<host>/api/` answers `{"message":"Custoro API","version":...,"environment":"production"}` (nginx proxies `/api/` to the API root).
- The API log (`docker compose -f docker-compose.prod.yml logs --tail 50 api`) has no `Refusing to start` and no `Warning:`.
- `SELECT COUNT(*) FROM migrations` equals the number of files in `apps/api/migrations`.
- Log in, open a list, open an invoice PDF through its public link, send the mail test if the mail settings changed. Everyone logs in again when token versions changed (the changelog says when).

## 6. Rollback

There is no `down`. Stop the API, restore the dump into the database (data written since the backup is lost, which is why the API is stopped before it), start the previous images (keep their tags: `API_IMAGE`, `WEB_IMAGE`), restore the volumes only if files changed.

## 7. Hand over

Write the runbook to the PR or a notes file: the pre-flight output, the commands in order with the owner's values as placeholders, the rollback, and what you could not check (the live server's real settings, the hosted TLS certificate, a restore test of the backup).
