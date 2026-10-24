---
name: custoro-api-endpoint
description: Add or change a Custoro API endpoint end to end: route with authenticate and authorize, service with parameterised SQL, body and id validation, paging, error message keys with the web texts in en, et and fun, unit tests, a Playwright api test and the changelog. Use when asked to "add an endpoint", "add a route", "add a field to customer / product / invoice / user", "return a new error message", "add paging or search to a list", or "change what an endpoint answers".
---

# Custoro API endpoint

Pattern to follow: `routes/customer.ts` + `services/customer.ts` (single item), `routes/customers.ts` + `services/customers.ts` (list). Copy their shape; skeletons for the tests are in [references/skeletons.md](references/skeletons.md).

## 1. Route: `apps/api/routes/<name>.ts`

Routes only wire middleware and call one service function. Order is fixed:

<!-- prettier-ignore -->
```ts
router.put(
    "/:id",
    authenticate,
    authorize(["admin", "user"]), // ["admin"] for accounts, settings, mail
    requireIds("id"), // or requireParams(...) when a segment may be a word ("all", "paid")
    ...imageUpload("avatar"), // only if a file is accepted; after every check
    async (req, res) => {
        res.json(await putSingle(req));
    }
);
```

- A route without `authenticate` is public: only login, password reset and `GET /pdf/:hash` are, on purpose.
- Register a new router in `apps/api/config/importer.ts` (`app.use("/name", name)`) and keep `config.routes` in `config/config.ts` in step.
- Add the route to `protectedRoutes` (and `adminOnlyRoutes` if admin-only) in `apps/web/tests/authorization.api.spec.ts`.
- Check the result: `node .claude/skills/custoro-security-review/scripts/route-table.mjs` must exit 0 and show the roles you meant.

## 2. Service: `apps/api/services/<name>.ts`

- Signature `(request: Request)`; read `request.database`, `request.params`, `request.body`, `request.query`.
- **Body**: `parseInput(request.body, schema)` from `helpers/bodyInput.ts`. Add the schema to `helpers/resourceInput.ts`: `text(max)`, `whole`, `decimal`, `oneOf`, `rowId`; `max` is the column size in `db/01-schema.sql`. On `!input.ok` return `{ success: false, message: input.message }` (`invalidInput`). Only named fields are read.
- **SQL**: `query<T>({ database, sql, params, logger })` with `?` placeholders only. A value is text, a finite number, boolean, null, Date or bigint; arrays, objects and `undefined` are refused. Never put a value, id, column or direction into the SQL string. A sort column comes from an allowlist (see `getCustomers` in `routes/_getters.ts`).
- **Several statements that must succeed together** (a counter and a row, an invoice and its lines): `withTransaction(database, logger, fallbackMessage, async (connection) => {...})` from `helper/transaction.ts`; throw `new TransactionRefusal("<key>")` for an expected refusal; it returns `{ ok, value }` or `{ ok: false, message, code }`. Lock the row you read first (`SELECT ... FOR UPDATE`).
- **Writes**: `postGeneralSingle` and `putGeneralSingle` in `services/_helpers.ts` answer `{ success, insertId }` / `{ success }` with the generic key `error` on a failed statement. PUT and DELETE act on `params.id` (the URL), not an id in the body.
- **Database refusals** become their own keys: `ER_DUP_ENTRY` -> `user.exists` / `product.exists`, `ER_ROW_IS_REFERENCED_2` -> `customer.inUse` / `product.inUse` (`code` is on the `query()` result).
- A file saved by the upload middleware is removed again when the request is then refused.
- Money is `DECIMAL`, read as numbers (`decimalNumbers`). Dates are strings (`dateStrings`).

## 3. Lists

Route paths `["/", "/:id", "/:id/:order/", "/:id/:order/:direction"]`; the getter in `routes/_getters.ts` returns `{ sql, totalSql, params }`; the service calls `getGeneralMultiple({ request, sql: getFromTo(sql, page, limit), params, totalSql, type })`.

- `getPaging`: page and limit are positive whole numbers, size at most `config.maxItemsPerPage` (50); no page and no limit gives `config.maxListRows` (1000), which the web pickers need.
- Keyword: `keywordWhere` (every word must match; 8 words of at most 64 characters; `%` and `_` are text).
- Paging inside a derived table: put `limitMarker` where the `LIMIT` goes; `applyPaging` replaces it.
- A list over many rows needs an index for its filter and sort; check with `EXPLAIN ANALYZE` on 50k invoices (`custoro-db-migration` has the data script).

## 4. Messages and the web texts

The API answers `{ success: false, message: "<key>" }` with HTTP 200 and the web app shows `t("notification.<key>")` (`Notification.tsx`). The API's own `locales/` hold invoice PDF texts, not these.

- Add the key under `"notification"` in all three of `apps/web/public/locales/en.json`, `et.json` and `fun.json` (same keys everywhere; `fun` is the joke locale, match its tone).
- A refused **delete** shows its own text only for the keys listed in `deleteRefusals` in `apps/web/src/hooks/useDeleteItem.ts` (`product.inUse`, `customer.inUse`, `worksheet.locked`); add yours there, any other failure shows the general error.
- New fields on a form: the web form, `apps/web/src/types` and the labels in the three locale files.

## 5. Tests

- **Unit** next to the code: `services/<name>.test.ts` (mock `../helper/query`, pattern of `services/references.test.ts`), helper tests in `helpers/`, transactions with `helper/testing/fakeDb.ts`. Cover the refusal keys and that the SQL has `?` for every value.
- **Playwright api** `apps/web/tests/<topic>.api.spec.ts` (the name must end in `.api.spec.ts`): no token (401 `auth.header`), regular user on an admin route (`forbidden`), hostile id (`/x/1%20OR%201=1` gives `error`), bad body (`invalidInput`), the happy path, and a parallel race when the endpoint reserves something. It creates data: dev or scratch database only.
- A test that must fail on the old code is the proof of a fix: run it before and after.

Run (dev-stack skill has the containers): API `docker compose exec -T api sh -c "npx prettier --check . && npx eslint . && npm run type-check && npx vitest run"`; Playwright `npx playwright test --project=api --workers=1`.

## 6. Finish

`CHANGELOG.md` entry under `## Unreleased` (`### Added`, `### Changed`, `### Fixed` or `### Security`), then `custoro-pr`. A new endpoint that exposes data or changes settings gets a look from `custoro-security-review`.
