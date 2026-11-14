# Several companies in one Custoro (multi-tenant plan)

Status: **plan**, nothing built. Written 2026-11-14 against `main` at 5.0.1.

## Goal

One Custoro install serves several companies ("tenants"). People log in once; their account,
password and picture are shared. Everything a company owns is separated from the other
companies: its customers, products, worksheets, invoices, invoice numbering, company details,
email texts, logo, invoice PDFs and mail server.

Today: 1 company live, a second one soon, more later. It has to work for 1 to 50 companies on the
current hosting (Zone.ee: one MariaDB 11.4, **16 databases per account, 9 used**) and on MySQL 8.4.

## Decision: one database, a `tenant_id` on every company row

|                             | One database, `tenant_id` (chosen)           | A database per company                        |
| --------------------------- | -------------------------------------------- | --------------------------------------------- |
| New company                 | one command, no panel                        | a database and rights in the Zone panel first |
| Zone limit                  | none                                         | 7 databases left, so 7 companies at most      |
| Migrations, backups         | once                                         | once per company                              |
| Database connections        | one pool of 10                               | up to 10 per company                          |
| Separation                  | every query must filter (guarded, see below) | by the database server                        |
| One company moved out later | `WHERE tenant_id = X` export, mechanical     | already apart                                 |

A database per company was the first idea (2026-11-12). It runs into Zone's database limit and
multiplies migrations, backups and connections. The risk of one shared database, a query that
forgets its company, is closed by four guards (see "Separation guards").

## Data model

```
users (shared)              tenants                    memberships
  id                          id                         user_id   -> users.id
  username (email)            name                       tenant_id -> tenants.id
  password, name, avatar      active                     role: admin | user
  token_version, reset link   created                    PRIMARY KEY (user_id, tenant_id)
  theme, discount, offer

company tables: every row has tenant_id NOT NULL -> tenants.id
  config  customers  products  worksheets  invoices  invoice_items
```

- **`users`** stays as it is, minus `role`, which moves to `memberships`: a person can be the
  admin of one company and a regular user of another. Theme and the discount/offer columns are
  the person's own view settings and stay on `users`.
- **`config`** (company details, invoice counter `lastInvoiceId`, email texts, logo, PDF prefix)
  gets one set of rows per company: the unique key becomes (`tenant_id`, `name`).
- **Unique keys per company:** product `code` and invoice `number` become (`tenant_id`, ...),
  so every company has its own product codes and starts its own invoice numbering. The invoice
  `hash` (public PDF link) stays unique across all companies.
- **Indexes** start with `tenant_id`: `(tenant_id, customer_id)`, `(tenant_id, number_sort)`,
  `(tenant_id, customer_id, id)` for worksheets, and so on, so lists stay as fast as now.
- **Foreign keys include the company.** `customers`, `products`, `invoices` and `worksheets` get
  a unique key (`tenant_id`, `id`), and every reference becomes composite, for example
  `invoices (tenant_id, customer_id) -> customers (tenant_id, id)`. The database itself then
  refuses an invoice of company A that points at a customer of company B.
- `tenant_id` has **no default** once the existing rows are filled: an INSERT that forgets it
  fails instead of landing in some company.

## Who is who in a request

1. **Login** (`POST /login`) checks email and password against `users`, then reads the
   memberships. One company: the token is for it. Several: the answer lists them and the web
   app asks which one (and remembers the last one).
2. **The token** carries the user id, `token_version` (as now) and the tenant id (`tid`).
3. **`authenticate`** loads the user and the membership for `tid` in one query. No membership, an
   inactive company or an old `token_version`: 401. The role comes from the membership, so
   removing someone from a company takes effect on their next request.
4. The request then carries `req.tenant = { id, role }`. **The company comes only from the
   verified token**, never from a header, URL, body or the Origin (the old Origin-based database
   choice was removed as insecure for this reason).
5. **Switching company** (`POST /login/tenant`): checks the membership and answers with a new
   token. The web app shows the company name and a switcher in the sidebar.

The public invoice link `GET /pdf/:hash` needs no login: the hash finds the invoice, and the
invoice row says which company's PDF and settings to use.

## Separation guards

1. **The type system.** Services take a `scope: { database, tenantId }` instead of a database
   name, so a service that runs company queries cannot be called without a company.
2. **A test of every SQL statement.** A unit test collects the SQL of all services, getters and
   helpers (about 130 statements today) and fails when a statement on a company table has no
   `tenant_id`. A deliberate exception (the public PDF lookup by hash) is listed by name.
3. **The database.** Composite foreign keys (above) and no default for `tenant_id`.
4. **A cross-company test suite** (Playwright `api` project, `tenants.api.spec.ts`): two
   companies, a person in each and one in both. For every endpoint: company A's lists never show
   B's rows, and every get, change and delete with B's ids answers "not found" (no "forbidden",
   which would confirm the id exists). Invoice numbers start at 1 in both. Removing a membership
   ends access at once. Settings, logo, mail settings and PDFs stay apart.

Then a security review of the finished branch (`custoro-security-review`), focused on cross-company
access.

## Files

| Now                                | Then                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `storage/pdf/<prefix><number>.pdf` | `storage/pdf/<tenant>/...`: both companies have an invoice 1                      |
| `storage/mail-settings.json`       | `storage/mail/<tenant>.json`, falling back to the shared file                     |
| `uploads/` (logos, avatars)        | stays one folder (random file names); deleting a logo checks it is that company's |

## Existing data

The migration makes the current data company 1, so the live install keeps working:

1. Create `tenants` and `memberships`; company 1 is named after the company name in `config`.
2. Every user becomes a member of company 1 with their current role.
3. Add `tenant_id` to the six company tables, fill it with 1, then drop the default.
4. Replace the unique keys, indexes and foreign keys with the company ones.
5. Drop `users.role`.
6. Move the PDFs to `storage/pdf/1/` (the deploy script, not SQL).

Checked with the schema-drift script on MySQL 8.4 and MariaDB 11.4 (`custoro-db-migration`), on
the demo data and on the 50k-invoice data, with timings before and after (`custoro-perf-check`).

## A new company

```bash
custoro create-tenant "Company Name" --admin owner@example.com
```

Creates the company with the default settings (today's `02-seed.sql` rows) and makes the person
its admin: an existing account just gets the membership, a new one gets the "set your password"
email. Platform-wide administration in the web app (list, deactivate companies) is later work.

## Users page

An admin manages the people **of their company**: adding an email that already has an account
adds a membership (no second account); removing someone removes the membership, and the account
itself is deleted only when it belongs to no company. The last-admin guard works per company.

## Order of work (one branch, one PR, commit per step)

1. This plan
2. Schema: migration, `01-schema.sql`, seed, drift check on both servers
3. Login, token, `authenticate`, switching company
4. Services and getters with `scope`, resource by resource (settings and invoice numbering,
   customers, products, worksheets, invoices, export, search, email, PDF)
5. Users and memberships, last-admin guard per company
6. Files: PDFs, mail settings, logo
7. `create-tenant` and `create-admin --tenant` (script and `custoro.sh`)
8. Web: company choice at login, name and switcher in the sidebar, users page
9. Guards 2 and 4 (SQL test, cross-company suite), performance check
10. Guide, CHANGELOG, security review, release

About 2 to 3 days. Released as **6.0.0**: the tokens change, so everyone logs in once more, and the
migration changes every company table (backup first; the deploy script takes one).

## Open questions

1. **Mail:** does each company send from its own mail server (planned, with the shared settings as
   fallback), or one sender for all?
2. **Several companies per person:** expected (an accountant)? The model allows it either way; it
   decides how prominent the switcher is.
3. **Who creates companies:** only the owner over SSH (planned), or a web page later?
4. **Name of company 1** if the company name in the settings is empty.

## Not in this plan

- A company's own domain or subdomain (all companies share `custoro.eastsidecustoms.com`)
- Billing, plans or limits per company
- A database per company (possible later for one large customer: export by `tenant_id`)
