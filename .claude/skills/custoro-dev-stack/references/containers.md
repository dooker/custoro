# Running checks in containers (host Node 22)

The repo needs Node 24 and refuses installs on anything else (`engine-strict=true`), so installs and test runs that need fresh `node_modules` happen in containers. Replace `custoro-skills` with the compose project of the running stack (`custoro` for the default one; the network is `<project>_default`).

## API

The `api` service already has its `node_modules` in the image (the source is bind-mounted over `/app`, the modules stay in an anonymous volume):

```bash
# stack running
docker compose -p custoro-skills exec -T api sh -c "npx prettier --check . && npx eslint . && npm run type-check && npx vitest run"
# stack not running (builds the image, does not start the database)
docker compose -p custoro-skills run --rm --no-deps -T api sh -c "npx vitest run"
```

`npm run lint` in `apps/api` is `eslint --fix` and rewrites files; CI and the line above use `npx eslint .`, which only checks. A passing run today: 32 test files, 508 tests.

## Web: unit tests and the Playwright `api` project

A one-off Node 24 container on the stack's network, with the repository mounted and `node_modules` in a named volume (so the host's folder stays clean and a second run skips the install):

```bash
cp apps/web/.env.development.example apps/web/.env     # once; holds the E2E_* logins (demo accounts)
docker run --rm --network custoro-skills_default \
  -v "$PWD:/repo" -v custoro-skills-webmods:/repo/apps/web/node_modules \
  -w /repo/apps/web -e E2E_API_URL=http://api:3999 \
  node:24-bookworm-slim sh -c "npm ci && npx vitest run && npx playwright test --project=api --workers=1 --reporter=line"
```

- `E2E_API_URL=http://api:3999` reaches the API by its service name; variables already in the environment win over `apps/web/.env`.
- `--reporter=line` matters: the default HTML reporter waits to serve its report after a failure and hangs in a container.
- The `api` project needs no browser. The `chromium`, `firefox` and `webkit` projects do (`npx playwright install --with-deps chromium`) and also need the web service on port 3000.
- Lint and type-check for the web app: `npx prettier --check "src/**/*.{ts,tsx,css,md}" && npm run lint && npm run type-check` in the same container.
- Remove the volume when done with the project: `docker volume rm custoro-skills-webmods`.

## Against the host

Where `node_modules` was installed earlier (the main checkout), `npx vitest run` works on Node 22 in either app. A fresh worktree has no `node_modules` and cannot get them on the host.
