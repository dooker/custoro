# Custoro

Self-hostable invoicing and worksheet app: customers, products, worksheets, invoices with PDF and email. An npm monorepo, one version and one `CHANGELOG.md` for both apps. Public GitHub repo (`dooker/custoro`): never commit secrets, tokens or real customer data.

## Layout

```
apps/api/    Express 5 + TypeScript + MySQL REST API, port 3999
  routes/    one file per resource, only wiring: authenticate -> authorize -> checks -> service
  services/  the rules and the SQL, one function per request
  helper/    database plumbing: query(), withTransaction(), invoice numbers (helper/testing/fakeDb.ts for tests)
  helpers/   small pure rules, unit tested without Express or a database: auth, input checks, rate limits, paths
  migrations/  db-migrate files (CommonJS), shared checks in config/migrationHelpers.js
  db/        01-schema.sql, 02-seed.sql (first start of an empty database), demo/ (dev only)
apps/web/    React + Vite + TypeScript, port 3000; Playwright suites in tests/, texts in public/locales
docker-compose.yml        dev: MySQL + API + web, ports on 127.0.0.1 only
docker-compose.prod.yml   production: MySQL + API + nginx
```

Request flow: **route -> service -> helper**. A route holds no SQL and no business rules, a service holds both, helpers are small and generic. The API answers refusals with HTTP 200 and `{ success: false, message: "<key>" }`, where the key is a text under `notification` in `apps/web/public/locales/{en,et,fun}.json`.

## Rules that are always true

- Every SQL value is a `?` parameter of `query()` (it refuses arrays, objects and `undefined`); several statements that must succeed together go through `withTransaction`.
- Production runs **MySQL 8.4** (`docker-compose.prod.yml`), but the hosted database is **MariaDB 11.4**. SQL and migrations must work on both.
- Schema changes are a migration in `apps/api/migrations/` plus the same end state in `apps/api/db/01-schema.sql`. Money is `DECIMAL`, every table `utf8mb4_unicode_ci`.
- Prettier: API double quotes and no trailing commas, web single quotes and ES5 commas, both 4 spaces and 100 columns. CI runs it with `--check`.
- A user-visible or deploy-relevant change gets a `CHANGELOG.md` entry under `## Unreleased`.

## Node 22 on the host, Node 24 required

`.nvmrc`, `engines` and `engine-strict=true` require Node 24; this machine has Node 22. So **installs and the server run in the `api` container**, not on the host. vitest does run on the host wherever `node_modules` already exist (a fresh worktree has none).

## Commands

```bash
npm run docker:dev        # MySQL + API + web with hot reload, Docker only
npm run docker:down       # stop, keep the database
npm run lint              # both apps; the API's script runs eslint --fix
npm run type-check        # both apps
npm test                  # both apps' unit tests, once
```

What CI runs (`.github/workflows/ci.yml`), per app:

```bash
# apps/api, in the container: docker compose exec -T api sh -c "..."
npx prettier --check . && npx eslint . && npm run type-check && npx vitest run && npm run build
# apps/web
npx prettier --check "src/**/*.{ts,tsx,css,md}" && npm run lint && npm run type-check && npx vitest run && npm run build
```

Playwright `api` project (no browser; needs the dev stack and `apps/web/.env`, see the dev-stack skill):

```bash
cd apps/web && npx playwright test --project=api --workers=1
```

## Skills (`.claude/skills/`)

| Skill                     | Use it to                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `custoro-dev-stack`       | start, stop and reset the dev stack, demo logins, run checks and Playwright in containers |
| `custoro-db-migration`    | add a migration; schema-drift check on MySQL and MariaDB; 50k-invoice test data           |
| `custoro-security-review` | review the API for security problems and report what was verified by running              |
| `custoro-api-endpoint`    | add or change an endpoint: route, service, validation, texts, tests                       |
| `custoro-pr`              | commits, CHANGELOG entry, PR description, CI, Copilot review comments                     |

Never commit `.claude/settings.local.json` or `.claude/worktrees`.
