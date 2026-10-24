---
name: custoro-security-review
description: Review the Custoro API for security problems and report findings without changing code. Use when asked for a "security review", "audit", "pentest", "is this endpoint safe", "check authorization on the new route", "review this diff for security", or after changes to routes, uploads, settings, login, rate limits or SQL building. Checks by running the API (hostile input, race tests, query digests), not only by reading.
---

# Custoro security review

**Report only. Change no code unless the user asks** (then one commit per finding, see `custoro-pr`). Every finding says how it was established:

- **Verified by running**: the command and what came back.
- **Read from code**: `file:line`, and why it could not or was not run.

Never present a read-only suspicion as confirmed. Findings go worst first. Also list what was checked and found fine, and what was not checked. Format: [references/report-template.md](references/report-template.md).

## 1. Set up

Use a private compose project with a populated database (`custoro-dev-stack` skill): `DB_PORT=3316 docker compose -p custoro-audit up -d --build --wait db api`, then load `.claude/skills/custoro-db-migration/scripts/gen-volume.sql`. Log in as the demo admin and the regular user (`apps/api/db/demo/demo-logins.md`). Public repo: never put real tokens or customer data in a report.

## 2. Read: the checklist

Start with the route table, which reads every route file:

```bash
node .claude/skills/custoro-security-review/scripts/route-table.mjs
```

It lists method, path, allowed roles and checks; exit 1 for a public route that is not in its by-design list, a route without `authorize`, or an upload that runs before the checks. Then read for:

1. **Authenticate and authorize on every route.** Public by design: `POST /login`, `POST /login/forgot`, `POST/PUT /login/token`, `GET /pdf/:hash` (the unguessable server-made hash is the invoice's only credential, so it must stay out of logs and Sentry), `GET /` (version) and the static `/uploads`. Any other public route is a finding.
2. **Admin-only:** `/users`, all of `/user`, `PUT` and `DELETE /settings`, and `/search?resource=users` (checked in `services/search.ts`). Regular users may read `GET /settings`. A route that exposes accounts, settings, mail configuration or another user's data is admin-only. A hidden menu in the web app is not a control.
3. **Middleware order:** `authenticate`, `authorize`, `requireIds`/`requireParams`, `...imageUpload(field)`, handler. A refused request must not write a file.
4. **Input:** ids through `requireIds` (digits, up to 2147483647); bodies through `parseInput` schemas in `helpers/resourceInput.ts` (only named fields, lengths = column sizes); `query()` refuses non-scalar parameters.
5. **Settings** (`helpers/settingsInput.ts`): key allowlist, value rules (VAT, `lastInvoiceId` digits, port, `invoiceFilenamePrefix` `^[A-Za-z0-9_-]{0,32}$`); mail settings are written to `.env.email` as four one-line values.
6. **Uploads** (`helpers/imageUpload.ts`): png, jpeg, gif, webp only, magic bytes checked, 5 MB, name chosen by the server; `/uploads` is served with `nosniff` and `Content-Security-Policy: default-src 'none'; sandbox`. Paths built from database values must stay inside their folder (`resolveInside` in `helpers/pdfFiles.ts` does for PDFs).
7. **Sessions:** the token carries `id` and `tv`; `users.token_version` rises on password or email change and on reset; the role is read from the database on every request; HS256 only; production refuses a `JWT_SECRET` under 32 characters. Refused tokens answer HTTP 200 with `success: false` (`invalid.token`, `session.expired`); a missing header is 401.
8. **Rate limits** (`helpers/rateLimit.ts`): per 15 minutes 10 failed logins per account and address, 50 per account, 50 per address; reset emails 3 per account and 10 per address per hour; the profile current-password check. Accounts count by `users.id` because `users.username` ignores case, accents and trailing spaces. `TRUST_PROXY` is the number of proxies believed (the prod compose requires it).
9. **Password reset:** token stored as SHA-256 hash, one hour, once; the email goes to the stored address, not the typed one; the link is built from `APP_ORIGIN`; the answer is the same for unknown emails.
10. **Dynamic SQL parts.** `grep -rn '\${' apps/api/services apps/api/routes/_getters.ts apps/api/helper | grep -v test` and check each: allowed ones are an ORDER BY column from an allowlist plus `ASC`/`DESC`, `LIMIT` from `getPaging`/`applyPaging`, escaped `LIKE` patterns (8 words of at most 64 characters), constant table and column names. Anything else interpolated is a finding.
11. **Errors:** `helpers/errorResponse.ts` answers 4xx with the standard text only and 500 with a generic one; `query()` returns the key `error` and logs details server-side; `helpers/sentryScrub.ts` removes bodies, the Authorization header and PDF hashes.
12. **CORS and Origin:** allowed are no Origin, `http://localhost:*` and `APP_ORIGIN`; the database is never chosen from a header.
13. **Mail:** SMTP login only over TLS (`EMAIL_REQUIRE_TLS=false` only in dev); invoice link from `APP_ORIGIN`.
14. **Production config:** `docker-compose.prod.yml` requires `TRUST_PROXY`, `JWT_SECRET`, `APP_ORIGIN`; nginx security headers (`apps/web/nginx/`).

Earlier findings that may still be open are in [references/known-open.md](references/known-open.md). Check them against the code before repeating one.

## 3. Run: verify instead of assuming

[references/probes.md](references/probes.md) has the commands, with the answers a correct API gives:

- authorization matrix: no token, junk token, regular user on admin routes;
- hostile ids, bodies, `ORDER BY`/direction, a 1000-word keyword, page and limit extremes;
- uploads (HTML as PNG, SVG, oversize) and `GET /uploads/` listing;
- race tests: parallel `POST /user` with one email, parallel invoice creation (pattern in `apps/web/tests/invoice-numbers.api.spec.ts`);
- login limit and its spellings of one email, session revocation after a password change;
- **query digests**: empty `performance_schema.events_statements_summary_by_digest`, run the probes, read which statements were slow, examined many rows or used no index. MariaDB has `performance_schema` off: use its slow log table instead (commands in the file).

Time database work from the database side, not only the HTTP side. A probe that is slow on 50k invoices is a finding even if the answer is correct.

When a probe cannot be run (no SMTP sink, no TLS database, production-only behaviour), say so in the report and mark the finding "read from code".
