# Several companies in one Custoro (multi-tenant plan)

Status: **plan**, nothing built. Written 2026-11-14 against `main` at 5.0.1; the owner's answers
of the same day are in.

## Goal

One Custoro install serves several companies ("tenants"). Every company has its own people (any
number, each an admin or a user of that company), customers, products, worksheets, invoices,
invoice numbering, company details, email texts, logo, invoice PDFs and **its own mail server**.
No company sees anything of another. The owner of the install ("owner", today dooker@dooker.eu)
also has a page to create and manage the companies.

Today: 1 company live (East Side Customs OÜ), a second one soon, more later. It has to work for 1
to 50 companies on the current hosting (Zone.ee: one MariaDB 11.4, **16 databases per account, 9
used**) and on MySQL 8.4.

## Decisions

| Question             | Decision                                                                         |
| -------------------- | -------------------------------------------------------------------------------- |
| Where the data lives | **One database**, a `tenant_id` on every company row                             |
| People per company   | Many, each `admin` or `user` of their company                                    |
| Companies per person | **One** for now: the person's row says which (`users.tenant_id`)                 |
| Mail server          | **Per company**: host, port, user, password (and sender), the password encrypted |
| Creating companies   | Over SSH (`custoro create-tenant`) **and** an owner page in the app              |
| Company 1            | **East Side Customs OÜ**, the live data, with its one user dooker@dooker.eu      |

### One database, not a database per company

|                             | One database, `tenant_id` (chosen)           | A database per company                        |
| --------------------------- | -------------------------------------------- | --------------------------------------------- |
| New company                 | one command or the owner page                | a database and rights in the Zone panel first |
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
tenants                       users
  id                            id
  name (unique)                 tenant_id -> tenants.id   one company per person
  active                        role: admin | user        in that company
  created                       owner: 0 | 1              the install's owner (owner page)
                                username (email, unique over all companies)
                                password, name, avatar, token_version, reset link, theme ...

company tables: every row has tenant_id NOT NULL -> tenants.id
  config  customers  products  worksheets  invoices  invoice_items
```

- **`users`** gets `tenant_id` and `owner`; `role` stays and means the role in that company. An
  email is unique over all companies, since a person belongs to one. When several companies per
  person are needed (an accountant), `tenant_id` and `role` move into a `memberships` table and a
  company switcher appears; nothing else in this plan changes for that.
- **`config`** gets one set of rows per company: company details, invoice counter
  (`lastInvoiceId`), VAT, email texts (invoice and password emails), logo, PDF prefix and the mail
  server (below). Its unique key becomes (`tenant_id`, `name`).
- **Unique keys per company:** product `code` and invoice `number` become (`tenant_id`, ...), so
  every company has its own product codes and starts its own invoice numbering. The invoice
  `hash` (the public PDF link) stays unique over all companies.
- **Indexes** start with `tenant_id`: `(tenant_id, customer_id)`, `(tenant_id, number_sort)`,
  `(tenant_id, customer_id, id)` for worksheets, and so on, so lists stay as fast as now.
- **Foreign keys include the company.** `customers`, `products`, `invoices` and `worksheets` get
  a unique key (`tenant_id`, `id`), and every reference becomes composite, for example
  `invoices (tenant_id, customer_id) -> customers (tenant_id, id)`. The database itself then
  refuses an invoice of company A that points at a customer of company B.
- `tenant_id` has **no default** once the existing rows are filled: an INSERT that forgets it
  fails instead of landing in some company.

## Mail server per company

How it was and is:

- Until 2026-11-07 the settings page wrote host, port, user and password to `/app/.env.email`,
  read back with dotenv: a `#` cut the password, and the file was in no volume or backup.
- Since 5.0.0 they are in `storage/mail-settings.json`; the password is encrypted (AES-256-GCM,
  `helpers/mailSecret.ts`) with `MAIL_SETTINGS_KEY` from `.env`, and the settings answer never
  sends it to the browser. One set for the whole install either way.

Then: every company's admin sets **host, port, user, password and sender** on its settings page,
as now. The mail server itself is outside Custoro (the company's own mail provider); Custoro
keeps the login it needs to send through it:

- Stored as `config` rows of the company (`mailHost`, `mailPort`, `mailUser`, `mailPassword`,
  `mailFrom`), so they are in the database backups and need no file per company.
- **The password is stored encrypted only**: `enc:v1:` AES-256-GCM with a fresh IV each time and
  a key derived from `MAIL_SETTINGS_KEY`. The key lives in `.env`, never in the database or a
  backup, so a stolen dump holds no usable password. The mail server needs the password itself to
  log in, so it cannot be hashed like a login password.
- **`MAIL_SETTINGS_KEY` becomes required in production**: the API refuses to start without it
  (today it only warns and stores the password as plain text). Zone has it set already.
- The password never leaves the API: the settings page shows "a password is saved", and an empty
  field on save keeps it.
- Invoice emails and password-reset emails use the mail server, sender and texts of the company
  of the invoice or of the person.
- The migration moves today's `storage/mail-settings.json` into company 1 (an encrypted password
  stays as it is) and leaves the file as a backup.

## Who is who in a request

1. **Login** (`POST /login`) checks email and password, as now.
2. **The token** stays as it is (user id and `token_version`), so nobody is logged out by this.
3. **`authenticate`** already loads the user on every request; it now also loads `tenant_id`,
   `owner` and whether the company is active, in the same query. An inactive company: 401.
4. The request carries `req.tenant = { id }` and `req.user.role`. **The company comes only from
   the person's row in the database**, never from the token, a header, URL, body or the Origin
   (the old Origin-based database choice was removed as insecure for this reason). Moving a
   person or deactivating a company takes effect on the next request.

The public invoice link `GET /pdf/:hash` needs no login: the hash finds the invoice, and the
invoice row says which company's PDF and settings to use.

## Owner page

For the owner only (`users.owner = 1`; set over SSH, never through the app):

- **Companies:** name, number of people and invoices, active or not, created
- **New company:** name and the email of its first admin, who gets the "set your password" email
  (sent with the owner's company's mail server until the new company sets its own)
- **Rename**, **deactivate** (its people can no longer log in; nothing is deleted) and
  **reactivate**

The owner works in their own company (East Side Customs OÜ) like any admin. The owner page shows
counts, not other companies' customers or invoices.

## Separation guards

1. **The type system.** Services take a `scope: { database, tenantId }` instead of a database
   name, so a service that runs company queries cannot be called without a company.
2. **A test of every SQL statement.** A unit test collects the SQL of all services, getters and
   helpers (about 130 statements today) and fails when a statement on a company table has no
   `tenant_id`. A deliberate exception (the public PDF lookup by hash) is listed by name.
3. **The database.** Composite foreign keys (above) and no default for `tenant_id`.
4. **A cross-company test suite** (Playwright `api` project, `tenants.api.spec.ts`): two
   companies with an admin and a user each. For every endpoint: company A's lists never show B's
   rows, and every get, change and delete with B's ids answers "not found" (no "forbidden", which
   would confirm the id exists). Invoice numbers start at 1 in both. Settings, logo, mail settings
   and PDFs stay apart. A deactivated company is locked out at once. Only the owner reaches the
   owner page.

Then a security review of the finished branch (`custoro-security-review`), focused on cross-company
access and the owner page.

## Files

| Now                                | Then                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `storage/pdf/<prefix><number>.pdf` | `storage/pdf/<tenant>/...`: both companies have an invoice 1                      |
| `storage/mail-settings.json`       | the company's `config` rows (above); the file stays as a backup                   |
| `uploads/` (logos, avatars)        | stays one folder (random file names); deleting a logo checks it is that company's |

## Existing data

The migration makes the current data company 1, so the live install keeps working:

1. Create `tenants`; company 1 is named after the company name in the settings (live: East Side
   Customs OÜ), or "Company 1" if that is empty.
2. Every existing user gets `tenant_id` 1 and keeps their role (live: dooker@dooker.eu, admin).
3. Add `tenant_id` to the six company tables, fill it with 1, then drop the default.
4. Replace the unique keys, indexes and foreign keys with the company ones.
5. The deploy script moves the PDFs to `storage/pdf/1/` and the mail settings into company 1.
6. The owner is set once over SSH: `custoro set-owner dooker@dooker.eu`.

Checked with the schema-drift script on MySQL 8.4 and MariaDB 11.4 (`custoro-db-migration`), on
the demo data and on the 50k-invoice data, with timings before and after (`custoro-perf-check`).

## A new company

On the owner page, or over SSH:

```bash
custoro create-tenant "Company Name" --admin boss@example.com
```

Creates the company with the default settings (today's `02-seed.sql` rows) and its first admin,
who gets the "set your password" email. That admin then adds the company's other people on the
users page (admins and users) and sets the company's details and mail server.

## Users page

An admin manages the people **of their company** only: adding, changing the role, removing. An
email that already has an account (in any company) cannot be added again; the answer is the
same as today's "email in use". The last-admin guard works per company.

## Order of work (one branch, one PR, commit per step)

1. This plan
2. Schema: migration, `01-schema.sql`, seed, drift check on both servers
3. `authenticate` with the company, `scope` for services
4. Services and getters, resource by resource (settings and invoice numbering, customers,
   products, worksheets, invoices, export, search, email, PDF)
5. Mail settings per company in `config`, `MAIL_SETTINGS_KEY` required, moving the file
6. Users page per company, last-admin guard per company
7. Files: PDFs per company, logo check
8. Owner: `set-owner`, `create-tenant` (script and `custoro.sh`), the owner page (API and web)
9. Guards 2 and 4 (SQL test, cross-company suite), performance check
10. Guide, CHANGELOG, security review, release

About 2 to 3 days. Released as **6.0.0**: the migration changes every company table (backup
first; the deploy script takes one), `MAIL_SETTINGS_KEY` becomes required, and the owner must be
set once. Nobody is logged out.

## Not in this plan

- A person in several companies, and a company switcher (the forward path is above)
- The owner seeing or editing another company's data
- A company's own domain or subdomain (all companies share `custoro.eastsidecustoms.com`)
- Billing, plans or limits per company
- A database per company (possible later for one large customer: export by `tenant_id`)
