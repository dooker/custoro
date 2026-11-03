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

A new database has no users. Create the first admin once the stack is up (it asks for the password; add `--name "Full Name"` to set the name shown in the app):

```bash
docker compose -f docker-compose.prod.yml exec api node dist/scripts/createAdmin.js you@example.com
```

The same command with `--reset` gives an existing user a new password and the admin role, if every admin is locked out. Only someone who can run commands on the server can use it.

Only the web container is exposed (`WEB_PORT`, default 80). It serves the built frontend and proxies `/api/*` to the API. Put a TLS-terminating proxy (for example Caddy) in front of it. Back up the `dbdata`, `uploads` and `invoices` volumes.

To update, back up first, then build the new images and apply the migrations while the API is stopped (the old API cannot run on a new schema). Run `migrate` only when the changelog says the release has migrations; it is harmless otherwise:

```bash
git pull && docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml stop api
docker compose -f docker-compose.prod.yml run --rm --build migrate
docker compose -f docker-compose.prod.yml up -d
```

`--build` makes `migrate` use the migrations of this checkout: it sits behind a profile, so the `build` above does not rebuild it. It connects to the bundled `db` service without TLS (it is on the Docker network). For another database see [apps/api/db/README.md](apps/api/db/README.md).

Set `TRUST_PROXY` in `.env`, or the stack will not start: `1` if people reach the web container directly, `2` if a TLS proxy such as Caddy is in front of it. It tells the API how many proxies to believe when it reads a visitor's address for the login limits; a wrong value lets a client forge its address (too high) or makes all visitors share the proxy's (too low). See `.env.production.example`.

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
| `npm test`             | Run both apps' unit tests once                       |

## License

[MIT](LICENSE) © Ingmar Ross
