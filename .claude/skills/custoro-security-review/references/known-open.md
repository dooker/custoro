# Reported earlier, possibly still open

Taken from the "Not in this PR" lists and notes of the 2026-10-16 to 2026-10-21 reviews (PRs 4 to 7). They were open then. **Check each against the current code before repeating it** and mark it "still open, confirmed at `<commit>`" or drop it.

| Area       | Item                                                                                                                                                                                 | Source            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| Files      | `deleteImageFile` (`services/_helpers.ts`) joins a filename from the database into `uploads/` without the containment check that PDFs have (`resolveInside`). Still so on 2026-10-24 | review 2026-10-16 |
| Web        | open redirect through `lastUrl`; logout only clears the browser token (tabs are not synced); any login error replaces the app with the server-error page                             | PR 5              |
| Caching    | no `Cache-Control` on `index.html`, no `no-store` on API responses                                                                                                                   | PR 5              |
| Rate limit | reset emails (3 per account per hour) can be used up by a stranger, so the owner gets none for an hour                                                                               | PR 5              |
| CORS       | any `http://localhost:*` origin is allowed in production (it only decides who may read answers)                                                                                      | PR 5              |
| Settings   | the Settings page sends its whole draft on every save, including `lastInvoiceId`; a stale page is now refused (`lastInvoiceIdTooLow`), the form should stop sending it unless edited | PR 7              |
| Mail       | `.env.email` values are written unquoted; a `#` in an SMTP password is cut when the file is read back                                                                                | PR 4              |
| Invoices   | locked (paid) invoices can still be edited through the API; invoices keep no copy of the customer's details                                                                          | PR 6              |
| Pickers    | lists asked for without `page` and `limit` return up to 1000 rows (`config.maxListRows`) until the web pickers are searchable                                                        | PR 4              |
| Ops        | no backup and restore routine for the three volumes; no CI job that compares a migrated database with `01-schema.sql` (`custoro-db-migration` has the script)                        | PR 6              |

Fixed since, do not report: password reset to the typed address, settings writable by any user, user search for regular users, PDF prefix path traversal, unlimited page size, forged `X-Forwarded-For`, plaintext SMTP login, keyword and body validation, id validation (PRs 3 to 7).
