# Custoro

Self-hostable invoicing and worksheet app: customers, products, worksheets, invoices with PDF generation and email sending.

> [!WARNING]
> **Not production ready.** The codebase has known, unresolved security issues and is being hardened in the open.
> Do not deploy it or use it with real data until this notice is removed.

> [!NOTE]
> **Database schema not included yet.** The schema and seed data (`apps/api/db/01-schema.sql`, `02-seed.sql`) will be added in a follow-up.
> Until then MySQL starts with an empty database: the web app and API start, but login and data features will not work.

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

SQL files in `apps/api/db/` are loaded the first time the database volume is created. See [apps/api/db/README.md](apps/api/db/README.md). To start from scratch: `npm run docker:reset`.

The schema and seed files are not in the repository yet (see the note at the top), so the database is currently empty.

## Production (Docker)

```bash
cp .env.production.example .env   # fill in secrets - never commit .env
npm run docker:prod               # or: docker compose -f docker-compose.prod.yml up -d --build
```

Only the web container is exposed (`WEB_PORT`, default 80). It serves the built frontend and proxies `/api/*` to the API. Put a TLS-terminating proxy (for example Caddy) in front of it. Back up the `dbdata`, `uploads` and `invoices` volumes.

## Scripts

| Command                | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| `npm run docker:dev`   | MySQL + API + web in Docker with hot reload          |
| `npm run docker:down`  | Stop the Docker dev stack                            |
| `npm run docker:reset` | Stop it and delete the local database                |
| `npm run docker:prod`  | Build and start the production stack                 |
| `npm run dev`          | MySQL in Docker, API + web on the host               |
| `npm run dev:api`      | API only, on the host                                |
| `npm run dev:web`      | Web only, on the host                                |
| `npm run db`           | Start only MySQL                                     |
| `npm run build`        | Build both apps                                      |
| `npm run lint`         | Lint both apps                                       |
| `npm run type-check`   | Type-check both apps                                 |

## License

[MIT](LICENSE) © Ingmar Ross
