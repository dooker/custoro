# Custoro

Self-hostable invoicing and worksheet app: customers, products, worksheets, invoices with PDF generation and email sending.

> [!WARNING]
> **Not production ready.** The codebase has known, unresolved security issues and is being hardened in the open.
> Do not deploy it or use it with real data until this notice is removed.

## Repository layout

```
apps/
  api/                  Node.js + Express + TypeScript + MySQL REST API (port 3999)
    db/                 SQL run on the database's first start (schema + seed)
  web/                  React + Vite + TypeScript frontend (port 3000)
docker-compose.yml      Local development: MySQL + API + web
docker-compose.prod.yml Production: MySQL + API + nginx (serves web, proxies /api)
CHANGELOG.md            Release history; one version for both apps since 4.0.0, old per-app logs below
```

The two apps are installed independently (each has its own `package-lock.json`).

## Local development

### Option A: everything in Docker

Requires only Docker.

```bash
npm run docker:dev        # or: docker compose up --build
```

- Web: http://localhost:3000 (hot reload)
- API: http://localhost:3999 (restarts on change)
- MySQL: localhost:3306, user `root`, password `custoro`

The ports are published on `127.0.0.1` only, so the stack (known database password, default JWT
secret, public demo logins) cannot be reached from the network. To open it to another device on
purpose, see the comment at the top of `docker-compose.yml`.

After changing dependencies, recreate the containers' `node_modules`: `docker compose up --build --renew-anon-volumes`.

### Option B: MySQL in Docker, apps on the host

Requires Node.js 24 (see `.nvmrc`) and Docker. Faster hot reload on macOS.

```bash
# 1. Install dependencies (root tools + each app)
npm ci && npm ci --prefix apps/api && npm ci --prefix apps/web

# 2. Environment files
cp apps/api/.env.development.example apps/api/.env.development
cp apps/web/.env.development.example apps/web/.env
# set DB_PASSWORD=custoro and JWT_SECRET (e.g. `openssl rand -hex 32`) in apps/api/.env.development
# set VITE_API_ENDPOINT=http://localhost:3999 in apps/web/.env

# 3. Start MySQL, API and web
npm run dev
```

### Database

The first time the database volume is created, MySQL loads the schema, the seed and the demo data from `apps/api/db/`. Production loads the schema and seed only. See [apps/api/db/README.md](apps/api/db/README.md). To start from scratch: `npm run docker:reset`.

Log in with the demo accounts in [apps/api/db/demo/demo-logins.md](apps/api/db/demo/demo-logins.md).

## Production (Docker)

```bash
cp .env.production.example .env   # fill in secrets - never commit .env
npm run docker:prod               # or: docker compose -f docker-compose.prod.yml up -d --build
```

Only the web container is exposed (`WEB_PORT`, default 80). It serves the built frontend and proxies `/api/*` to the API. Put a TLS-terminating proxy (for example Caddy) in front of it. Back up the `dbdata`, `uploads` and `invoices` volumes.

Set `TRUST_PROXY` in `.env`, or the stack will not start: `1` if people reach the web container directly, `2` if a TLS proxy such as Caddy is in front of it. It tells the API how many proxies to believe when it reads a visitor's address for the login limits; a wrong value lets a client forge its address (too high) or makes all visitors share the proxy's (too low). See `.env.production.example`.

### Backup and restore

The app keeps its data in three Docker volumes: the database (`dbdata`), the uploaded images (`uploads`) and the generated invoice PDFs (`invoices`). One command copies all three:

```bash
npm run docker:backup              # or: apps/api/scripts/backup.sh
```

It writes `backups/custoro-<UTC date and time>/` (`--dir` picks another place; git ignores `backups/`):

| File              | Contents                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `db.sql.gz`       | `mysqldump --single-transaction` of the database: one consistent snapshot, the API can keep running |
| `uploads.tar.gz`  | the uploads volume                                                                                  |
| `invoices.tar.gz` | the invoices volume                                                                                 |
| `SHA256SUMS`      | checksums of the three files (`sha256sum -c SHA256SUMS` checks them)                                |
| `manifest.txt`    | when, which Compose project, which database server                                                  |

The dump runs inside the `db` container with the password from that container's own environment, so the password is never printed and never on a command line. The script stops, and keeps nothing, when the dump is empty, cut off, or has no rows, and a folder without `.partial` in its name is a finished backup. A backup holds password hashes and customer data: keep it private (the folder is created for your user only) and **copy it off this machine**, because a backup on the same disk is lost with it. It needs the `db` service running; run it from cron or a systemd timer for a schedule (it exits with an error when anything fails). To pick the stack: `--project <name>`, `--env-file <file>`.

What a backup does not hold: `.env` (secrets: keep a copy somewhere safe) and the mail server settings saved on the admin settings page. The API writes those to `/app/.env.email` inside its container, which is in no volume, so set `EMAIL_*` in `.env`.

To restore:

```bash
npm run docker:restore -- backups/custoro-20261103T153000Z    # or: apps/api/scripts/restore.sh <folder>
```

**This overwrites data.** It first checks the backup (checksums, a complete dump, readable archives), shows what it will replace and asks you to type the project name. Then it stops the API, drops every table of the database, loads the dump, empties `uploads` and `invoices` and unpacks the archives, and prints the row count of every table. The API stays stopped; start it with `docker compose -f docker-compose.prod.yml up -d`, with the images that match the backup (a backup made before a migration needs the previous images). Anything written since the backup is lost. `--db-only` leaves the volumes alone (a rollback after a migration, when no files changed) and `--yes` skips the question.

On a new server: copy `.env` back, `docker compose -f docker-compose.prod.yml up -d --wait db` (creates an empty database), restore, then `up -d`.

The scripts work with the MySQL 8.4 `db` service and with a MariaDB 11.4 one, but a backup only restores into the same kind of server it came from: the generated column `invoices.number_sort` is written in a form the other kind refuses (MySQL's dump has the expression as `regexp_like()`, which MariaDB does not know; MariaDB's dump has the value in every INSERT, which MySQL refuses). `restore.sh` says so before it changes anything. `.claude/skills/custoro-deploy/scripts/rehearse-backup.sh` proves all of it on throwaway copies of the stack: it backs up a database with 50 000 invoices on each kind, restores it into a new server of the same kind and compares row counts, content checksums, money totals and files. The hosted database is not in the Docker stack, so `backup.sh` cannot reach it: take its dump with `mysqldump --single-transaction` from wherever it can be reached.

## Scripts

| Command                  | Description                                         |
| ------------------------ | --------------------------------------------------- |
| `npm run docker:dev`     | MySQL + API + web in Docker with hot reload         |
| `npm run docker:down`    | Stop the Docker dev stack                           |
| `npm run docker:reset`   | Stop it and delete the local database               |
| `npm run docker:prod`    | Build and start the production stack                |
| `npm run docker:backup`  | Back up the production stack's database and volumes |
| `npm run docker:restore` | Restore a backup into it (overwrites data)          |
| `npm run dev`            | MySQL in Docker, API + web on the host              |
| `npm run dev:api`        | API only, on the host                               |
| `npm run dev:web`        | Web only, on the host                               |
| `npm run db`             | Start only MySQL                                    |
| `npm run build`          | Build both apps                                     |
| `npm run lint`           | Lint both apps                                      |
| `npm run type-check`     | Type-check both apps                                |
| `npm test`               | Run both apps' unit tests once                      |

## License

[MIT](LICENSE) © Ingmar Ross
