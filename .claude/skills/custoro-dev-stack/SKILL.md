---
name: custoro-dev-stack
description: Start, stop, reset and test against the Custoro local dev stack (MySQL 8.4, API and web in Docker). Use when asked to "run the app", "start the dev stack", "bring up the database", "log in as the demo admin", "run the Playwright api tests", "run lint / type-check / unit tests", "reset the dev database", or when an audit or performance check needs the API running against a populated database. Covers ports, demo logins, the apps/web/.env test settings, private compose projects and the host Node 22 vs required Node 24 gap.
---

# Custoro dev stack

Facts: `docker-compose.yml` runs `db` (mysql:8.4), `api` (Node 24 image, source bind-mounted, hot reload) and `web` (Vite). All ports are published on `127.0.0.1` only (the stack has a known DB password and public demo logins).

| Service | Address                             | Notes                                               |
| ------- | ----------------------------------- | --------------------------------------------------- |
| web     | http://localhost:3000               |                                                     |
| api     | http://localhost:3999               | `GET /` answers `{"message":"Custoro API",...}`     |
| db      | 127.0.0.1:3306 (`DB_PORT` moves it) | user `root`, password `custoro`, database `custoro` |

## Start

1. Docker running? `docker info >/dev/null 2>&1 || open -a Docker`, then wait until `docker info` works.
2. Is something already on the ports? `docker ps --format '{{.Names}}\t{{.Ports}}'`. Another project may hold 3306, 3999 or 3000.
3. Start: `npm run docker:dev` (foreground, logs) or in the background `docker compose up -d --build --wait` (db and api; add `web` if you need the UI).
4. Check: `curl -s localhost:3999/` and `docker compose ps`.

`npm run dev` (MySQL in Docker, API and web on the host) needs Node 24 on the host. On a Node 22 machine use `docker:dev`: installs are refused by `engine-strict`.

## Stop and reset

- Stop, keep the data: `npm run docker:down` (`docker compose down`).
- **`docker compose down -v` (and `npm run docker:reset`) deletes the dev database volume.** Check what is in it first (`docker compose exec db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" custoro -e "SELECT COUNT(*) FROM invoices"'`) and do not run it from a side session on the default project. The schema, seed and demo data load only when the volume is empty, so after a reset the demo data is back and everything else is gone.
- After changing dependencies: `docker compose up --build --renew-anon-volumes`.

## Private compose project (side work, audits)

The compose file says `name: custoro`, so every checkout and worktree shares one project, its containers and its `dbdata` volume. Side work uses its own project so nothing is shared and `down -v` only touches its own volume:

```bash
DB_PORT=3316 docker compose -p custoro-audit up -d --build --wait db api
docker compose -p custoro-audit down -v     # removes only this project's volume
```

API port 3999 is fixed, so only one API runs at a time; `DB_PORT` is the only port that can move.

## Logins and test settings

- Demo logins (admin and a regular user): `apps/api/db/demo/demo-logins.md`. They exist only in the dev database.
- Playwright needs `apps/web/.env`: `cp apps/web/.env.development.example apps/web/.env`. It sets `E2E_USER`, `E2E_PASS` (admin) and `E2E_REGULAR_USER`, `E2E_REGULAR_PASS` (role `user`), plus `E2E_API_URL` and `E2E_WEB_URL`. All four credentials are required, a missing one throws "X is not set".

## Checks and tests (the host has Node 22)

API, in the container (any worktree; add `-p <project>` to use a private project):

```bash
docker compose exec -T api sh -c "npx prettier --check . && npx eslint . && npm run type-check && npx vitest run"
```

Web unit tests and the Playwright `api` project in a Node 24 container on the stack's network (recipe, with the exact flags, in [references/containers.md](references/containers.md)). Where `apps/web/node_modules` already exists on the host, `cd apps/web && npx vitest run` and `npx playwright test --project=api --workers=1` also work on Node 22.

## Playwright api tests: what they assume

- They create customers, products, worksheets and invoices, and the API cannot delete invoices. Run them on the dev or a scratch database, never a real one.
- Some assume a small database. `database.api.spec.ts` visits only the first three pages and the last one of the invoice list for that reason; a test that walks all pages times out on 50k invoices. The authorization spec compares settings snapshots and leaves the invoice counter out because other tests move it.
- Use `--workers=1` (what CI does). The login-limit tests rely on the dev compose settings (`LOGIN_MAX_FAILURES_PER_IP=500`, private proxy hops trusted), so run them against the compose API, not a hand-started one.

## Audits against a populated database

Load synthetic data into a private project (2000 customers, 500 products, 50k invoices, 250k lines, 100k worksheets, about 3 s):

```bash
docker compose -p custoro-audit exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < .claude/skills/custoro-db-migration/scripts/gen-volume.sql
```

The demo logins still work, since the demo rows stay. Time queries from the database side (see the security-review skill), not only through HTTP.
