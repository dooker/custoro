# Changelog

All notable changes to Custoro, the API and the web app together. Since 4.0.0 both apps share one
version number, kept in each app's `package.json`. The web app shows this file on its changelog page.

## Unreleased

### Added

- Web hosting without root, such as Zone.ee: `custoro.sh` has a second mode for an account
  without root, systemd or nginx of its own. It runs the API with PM2 from `~/custoro`, and the API
  serves the web app itself (new setting `WEB_DIR`, set by the script) with the same security
  headers and caching as the nginx setup, the API under `/api`. The host forwards the domain to
  `SERVICE_PORT` on `SERVICE_HOST` (Zone: the account's loopback IP). `custoro.sh deploy latest`
  installs the newest GitHub release that has a server bundle, so an update over SSH is
  `~/custoro/current/deploy/custoro.sh deploy latest`; the same backup, migration, health check
  and automatic way back as with systemd. Rehearsed in containers (Debian, Node 24, PM2 6, MariaDB
  11.4): install, login, update, broken update, rollback, backup; the systemd mode again with it.
  Guide: "Zone.ee web hosting" in `deploy/server/README.md`
- Production without Docker: every release now also has `custoro-<version>.tar.gz` (the built API
  and web app, the migrations, the schema for an empty database, an nginx site and a systemd unit)
  and `custoro.sh`. On a Linux server with Node 24 and nginx, `sudo bash custoro.sh deploy <version>`
  installs it under `/opt/custoro`; the same command updates it: it dumps the database, stops the
  API, migrates, switches to the new release and checks that it answers with the new version, and
  goes back to the previous release by itself if it does not. `rollback`, `status`, `backup` and
  `create-admin` do what they say. The database can stay where it is (a hosted MariaDB), the app's
  files and settings live in `/opt/custoro/shared`. The API listens on 127.0.0.1 only there (new
  setting `SERVICE_HOST`; Docker leaves it unset), so nobody reaches it past nginx. Rehearsed on Debian with Node 24 against
  MariaDB 11.4: a first install on an empty database, an update, a broken update, a rollback and
  a restore of the dump. Guide: `deploy/server/README.md`; `scripts/build-bundle.sh` builds the
  bundle from a checkout
- A user added on the users page gets an email with a link to set their password, valid for 7
  days. Before, the new account had no password and nothing told the user; they had to find
  "Forgot password?" on their own. The email is the password email of the settings page (its
  `[RESTORE_LINK]`), so word that text for both uses. The admin sees whether the email went out;
  if not (no mail server set up), the user can still use "Forgot password?" later
- An invoice export for the accountant: Settings, "Export for the accountant" (admins only) gives
  the invoices of a period, at most a year, as a CSV file (`GET /export/invoices?from=&to=`): one
  line per invoice with number, date, due date, customer, registry code, VAT number, net, VAT rate,
  VAT, total, paid and emailed. The amounts are those of the invoice PDFs (the same rounding, no
  VAT for a foreign VAT number, the customer as billed for a paid invoice); offers are left out.
  Semicolons and a decimal comma, as a spreadsheet set to Estonian expects; a customer name that
  starts like a formula (`=`, `+`, `-`, `@`) is written so that the spreadsheet does not run it
- A browser test of the main journey (`apps/web/tests/journey.spec.ts`): a new customer on the
  customer form, a worksheet for them, the worksheet billed on a new invoice, the totals on the
  screen, the PDF and its public link, marking it as paid, and the accountant's export. CI now
  runs it with the other Chromium tests (login, products, VAT) in a new `browser-tests` job; until
  now no browser test ran in CI
- The local Docker stack catches email: a `mail` service (`scripts/mail-catcher.mjs`, plain Node)
  takes every email the API sends and shows it at http://localhost:8025/messages; nothing leaves
  the machine. The demo data now has a password email with its link. New API tests
  (`password-reset.api.spec.ts`) use it to run the password links end to end through the real
  database and email: a new user's link, a reset that ends the old sessions, a link that works
  once, and no email for an address without an account. Before, these rules were only tested
  with stand-ins for the database and the mail server
- Every image knows which build it is. `scripts/docker-build.sh` (`npm run docker:build`, also used
  by `npm run docker:prod`) builds the production images with the git commit and the build time:
  `GET /api/` answers `{version, build, builtAt}`, the sidebar shows "v 5.0.0-rc.1 · 38bdbcb" (the
  build time on hover), the images carry them as labels, and error reports are grouped in Sentry by
  the release `custoro@<version>+<commit>`, in both apps. A checkout with uncommitted changes builds
  `<commit>-dirty`; a plain `docker compose build` still works and says "unknown". **Build with
  `scripts/docker-build.sh`** to see the build on a server
- Releases: one version for the root, the API and the web app, checked by a new `version` CI job
  (the root `package.json` said 0.0.0). `npm run version:suggest` proposes major, minor or patch
  from the entries under Unreleased and says which lines decided; `npm run release:prepare --
  <bump>` sets the version in all six package files and dates the changelog section. A release
  candidate comes first: `premajor` makes 5.0.0-rc.1, `prerelease` rc.2, and `release` makes it
  5.0.0 once it is live; the entries stay under Unreleased until then. **The version is now
  5.0.0-rc.1**, the release candidate of 5.0.0. When a release PR is merged, the new Release
  workflow tags the commit `v<version>`, publishes the GitHub release with the changelog section (a
  release candidate as a pre-release) and pushes the images to
  `ghcr.io/<owner>/custoro-api:<version>` and `custoro-web:<version>`. See "Version and build" in
  the README and the `custoro-release` skill
- Backup and restore for the production Docker stack: `npm run docker:backup` and
  `npm run docker:restore -- backups/<folder>` (`apps/api/scripts/backup.sh` and `restore.sh`). A
  backup is a dated folder with a `mysqldump --single-transaction` of the database, taken inside the
  `db` container with its own credentials while the API keeps running, the `uploads` and `invoices`
  volumes as archives, and checksums. It stops and keeps nothing when the dump is empty, cut off or
  has no rows. A restore checks the backup first, asks you to type the project name, then replaces
  the database and both volumes. Rehearsed with 50 000 invoices on MySQL 8.4 and MariaDB 11.4 (rows,
  content checksums, money totals, files; also a backup taken while the API writes). A backup only
  restores into the same kind of server (MySQL or MariaDB) as the one it came from, because of the
  generated column `invoices.number_sort`; `restore.sh` refuses the other kind before it changes
  anything. The invoices volume also holds the mail server settings saved on the admin page (see
  Fixed). Back up before every update and copy the folder off the server; see "Backup and restore"
  in the README
- Database schema, config seed and demo data (`apps/api/db`); local Docker starts with demo customers,
  invoices and two demo logins, production gets the schema and seed only
- Unit tests for the login logic in both apps, run in CI; the Playwright suite now also tests the login
  and forgot-password forms, and reads its login only from `E2E_USER` / `E2E_PASS` (loaded from
  `apps/web/.env`, prefilled with the demo admin in the example file). A browserless `api` Playwright
  project tests the API directly: concurrent invoice numbering, and authorization (tokens, admin-only
  routes, mail server settings, profile updates) with a second, non-admin test login
  (`E2E_REGULAR_USER` / `E2E_REGULAR_PASS`), regression tests for the upload and invoice PDF
  security fixes from 4.0.0, and tests for unique profile emails, the current-password check, session
  revocation and the login limit
- API tests for the database rules (`apps/web/tests/database.api.spec.ts`): creating users, searching,
  foreign and unique keys, worksheets on open and locked invoices, all-or-nothing invoice creation and
  the invoice list; unit tests for the transaction helper, invoice creation, the services and the
  search and list queries
- Component tests for the login, forgot-password and reset-password screens (`apps/web/src/components/Login`):
  what the user sees for a refused login, a failed request, invalid input, an unknown reset link and
  a refused new password, and that nothing is sent when the form is invalid. `vitest.config.ts` now
  extends `vite.config.ts`, so tests resolve the same `@css`, `@components` and `@images` aliases
- A way to create the first admin of a production install, which starts without users:
  `docker compose -f docker-compose.prod.yml exec api node dist/scripts/createAdmin.js <email>`. It
  asks for the password (hidden), or reads it from standard input, and never takes it as an argument.
  With `--reset` it gives an existing user a new password and the admin role, which also gets a
  locked-out admin back in; that ends the user's other sessions and any pending reset link
- A `migrate` service in `docker-compose.prod.yml` that applies the database migrations:
  `docker compose -f docker-compose.prod.yml run --rm --build migrate`. The production API image has
  no migration tool, so an upgrade needed a checkout of the repository with Node 24. `up` does not
  start the service, and it is safe on a database that is already up to date. See "Updating" in the
  README

### Security

- `@sentry/node` and `@sentry/profiling-node` 11.12: the API no longer ships `glob` 13 and
  `minimatch` 10 (GHSA-3g3m-2fjr-6pw4, GHSA-g3hv-75wg-m249, both medium; Sentry used them with its
  own patterns, not with request input). The `minimatch` 10 left is in eslint, typescript-eslint
  and nodemon, development tools only
- The mail server password saved on the admin settings page can be stored encrypted. It was plain
  text in `storage/mail-settings.json`, so every backup of the storage folder held it. With the
  new setting `MAIL_SETTINGS_KEY` (`openssl rand -hex 32`, in `.env` or `.env.production`) it is
  encrypted (AES-256-GCM) and a backup is no use for it without the key; a password saved before
  is encrypted when the API starts. It still cannot be hashed like a login password, because the
  mail server needs the password itself, and whoever runs the API has the key: this protects
  copies of the file, not a server that is taken over. If the key changes or is lost, mail stops
  ("missingInfo", and the log says why) until the admin saves the password again. Without the
  key the API warns at start and stores it as before; a key shorter than 32 characters stops the
  start. **Production setups should add `MAIL_SETTINGS_KEY`** and keep it apart from the backups
- A password link that was still open kept working after the account's email or password changed.
  So when an admin corrected a mistyped email of a new user, whoever read the mistyped address
  could still set the password with the link sent there and log in; and a reset link a user asked
  for kept working for its hour after they changed their password on the profile page. A change of
  the email (by an admin or on the profile) and a password change now cancel any open link
- The web container's access log (`docker compose logs web`) kept every password link
  (`/restore/<token>`) and public invoice link (`/pdf/<hash>`) in full, in the request and in the
  Referer of the API calls those pages make. Anyone who could read the server's logs could set a
  password with a link that was still open, or open any invoice. The log now writes those parts
  as `[hidden]`, also in the variants the app answers (`/RESTORE/`, `//pdf/`, `/api/%70df/`), and
  hides any run of 32 or more hex digits wherever it stands. **Rebuild the web image**; logs written before still hold the links, so remove
  them (`docker compose -f docker-compose.prod.yml rm -sf web`, then `up -d`) if others can read
  them
- Removing a user's picture or the logo deleted the file whose name was stored in the database,
  joined into the upload folder without a check, so a stored name such as `../x` could delete a file
  outside it. Only a file directly in the upload folder is deleted now, the rule invoice PDFs
  already had
- API answers carry `Cache-Control: no-store`, so customer, invoice and user data is not kept in the
  browser's or a proxy's cache and cannot be read back from a shared computer after logout. Uploaded
  pictures stay cacheable
- In production only `APP_ORIGIN` may read the API's answers from a browser; before, any
  `http://localhost` origin could. Development still allows every localhost port
- Logging out ends the session in the API too (`POST /login/logout`): the token, and the account's
  tokens on other devices, stop working at once instead of when they expire. Other open tabs of the
  app log out with it, and a login in another tab reloads them with the new session
- Reset emails are now limited per account and client address (3 per hour), per account across
  addresses (10) and per address (10), so a stranger asking from their own address can no longer use
  up the owner's budget. **`RESET_MAX_REQUESTS_PER_ACCOUNT` now sets the limit across addresses
  (default 10, it was 3 per account)**; the new `RESET_MAX_REQUESTS_PER_ACCOUNT_ADDRESS` (default 3)
  sets the one per address
- The API's production dependencies `multer` and `body-parser` had known vulnerabilities
  (`npm audit --omit=dev`) that let a crafted request keep the server busy (denial of service). They
  are updated within their version ranges, as are `qs`, `nodemailer` and Sentry; the web app's
  advisories are in the "Web dependencies" entry below. No production dependency is left at high or
  critical in either app. **Rebuild both images.** A new Audit workflow repeats the check on every
  pull request, on `main` and weekly, and Dependabot proposes updates weekly
- Password reset could be used by anyone to set the password of any user who had finished a reset
  before: the API cleared used tokens to an empty string and accepted an empty token. Tokens must now
  be well-formed, are stored only as a SHA-256 hash, expire after one hour and work once.
  **Existing databases must run the new migration** (see `apps/api/db/README.md`), which also clears
  all stored reset tokens
- "Forgot password" no longer reveals whether an address has an account: it always answers the same,
  and email failures only go to the server log and Sentry
- The reset link in the email is built from `APP_ORIGIN` instead of the request's `Origin` header
- A user could set their profile email to another user's address, after which login and password
  reset picked either account. Usernames are now unique (checked by the API, case-insensitively, and
  by a unique index). **Existing databases must run the new migrations**, which stop and list any
  duplicate usernames that need to be resolved by hand first
- Changing the email or password on the profile page needs the current password, so a stolen login
  token can no longer be turned into a permanent takeover. The profile page has a field for it
- Login tokens can be revoked: each carries the account's session version, which a password reset or
  a password or email change raises, ending every other session. Tokens of deleted users stop working
  at once, and the role is read from the database on every request, so a role change applies
  immediately. Tokens from before this release are refused, so everyone logs in once more. Tokens are
  only signed and accepted with HS256
- Failed logins are limited to 10 per account and 50 per client address in 15 minutes (HTTP 429 after
  that), and reset emails to 3 per account and 10 per address per hour; see `.env.production.example`
  for the settings and `TRUST_PROXY`
- Login takes as long for an unknown email as for a wrong password, so timing no longer shows which
  emails have an account
- Query parameters (emails, password hashes, reset-token hashes) are no longer sent to Sentry or
  written to production logs; request bodies and the Authorization header are removed from Sentry
  events, and the web app removes reset tokens from URLs before anything reaches Sentry
- The production web server sends security headers: a Content Security Policy for the app, HSTS over
  HTTPS, `X-Frame-Options`, `nosniff`, `Referrer-Policy` and `Permissions-Policy`. The API no longer
  sends `X-Powered-By` and its database connections no longer allow several statements in one query
- A failed database query no longer sends MySQL's error text to the browser, which named tables and
  columns and could quote stored values. The web app gets a generic error, the server log keeps the
  details, and Sentry gets them with quoted values removed
- Production migrations now check the database server's TLS certificate and host name; they used
  to encrypt without checking who answered. `DB_SSL` (`verify` or `off`) and `DB_SSL_CA` configure
  TLS for both the migrations and the API, see `apps/api/db/README.md`
- Settings can only be changed by admins. Any logged-in user used to be able to overwrite every
  setting, which allowed rewriting the password reset email so its link (and reset token) went to an
  attacker, changing the bank account printed on invoices, and changing the VAT rate and invoice
  numbering. `PUT` and `DELETE /settings` are now admin-only and refuse keys that are not settings and
  malformed values (VAT rate, last invoice number, mail port). Regular users no longer see the
  Settings page in the web app, though the API still lets them read the settings the invoice and PDF
  screens use. Unset mail server settings are shown empty instead of as the text "undefined"
- The invoice file name prefix could hold a path such as `../`, which made the API write and read
  PDFs (and attach them to emails) outside its PDF folder, and a character a header cannot carry
  (such as "š" or a line break) crashed the whole API process through the public PDF link. The prefix
  may now only have letters, digits, `_` and `-` (up to 32), is checked when it is saved, and PDF
  paths are checked again whenever a PDF is written, opened or emailed, so a value saved earlier
  cannot leave the folder. The download name is sent as `filename*` (UTF-8) with an ASCII fallback
  and a bad name can no longer take the server down. **An existing prefix that has other characters
  must be changed in Settings before PDFs can be generated again**
- A regular user could list every account (email, name, role, last seen) through the search, while
  `GET /users` was admin-only. Searching users is now admin-only too (HTTP 403 otherwise), and a
  search for an unknown resource answers with an error instead of failing inside the server
- Password reset emails go to the address stored for the account instead of the one typed in the form.
  The username column ignores case, accents and trailing spaces when it compares, so asking for a
  reset for `admin@exámple.com` found the account of `admin@example.com` and mailed the reset link to
  the lookalike domain, which let anyone who could register that domain take over the account
- The login limit could be sidestepped by typing the email differently: the limit counted per typed
  spelling, but the database treats `admin@x.com`, `ADMIN@x.com`, `admín@x.com` and `admin@x.com `
  as one account, so every spelling got its own 10 tries. Limits (login, reset email and the
  current-password check on the profile page) now count an existing account by its id. Because a
  stranger's failures could also lock the real owner out for as long as they kept trying, the
  10 failures per 15 minutes now count per account **and client address**, so the owner is not
  affected by another address; a larger budget of 50 per account across all addresses still stops
  a guess spread over many addresses. An IPv6 client counts as its whole /64, and an address
  that has used up its failures is turned away before the database is asked. Set
  `LOGIN_MAX_FAILURES_PER_ACCOUNT_ADDRESS` (new, default 10) and `LOGIN_MAX_FAILURES_PER_ACCOUNT`
  (default was 10, now 50, meaning all addresses together)
- The invoice link in emails (`[INVOICE_LINK]`) is built from `APP_ORIGIN` instead of the request's
  `Referer` header. The header is the sender's to choose, so anyone could put any link into an email
  sent from the company mailbox, and in production it is the full page address, which made the link
  wrong (`https://app/invoice/1/12/pdf/...`)
- The API refuses to start in production when `JWT_SECRET` is missing or shorter than 32 characters
  (`openssl rand -hex 32` makes a good one), since login tokens are only as safe as that secret
- Sentry no longer receives PDF links: the hash in `/pdf/<hash>` is the invoice's only credential and
  was in error and trace data (request URLs, span names). Traces are scrubbed like errors, and in
  production a tenth of them are sent instead of all (`SENTRY_TRACES_SAMPLE_RATE` changes that)
- Lists (customers, products, invoices, worksheets, users and the search) no longer return the whole
  table for `limit=1000000` or `page=0`: page and limit must be positive whole numbers (anything
  else counts as missing) and the page size is at most 50. The pickers in the web app ask for a
  list without a page or limit to get every customer and product; that still works but is cut off
  at 1000 rows. **Deliberately not clamped to 50**, which would silently drop entries from those
  pickers: they need to become searchable before the cap can go down. Page counts now match the
  page size actually used
- Mail server settings are written to `.env.email` as exactly four one-line values. A value such as
  `x\nJWT_SECRET=y` used to add a line to the file, which the API then copied into its environment
  (admin only). Line breaks are removed, only the four `EMAIL_` settings are read back, and a setting
  nobody has set is written empty instead of as the text "undefined"
- The API no longer picks its database from the request's `Origin` header (there is one app and one
  database). A request without that header, or with another one, used to end in an error 500 in
  production; nginx also no longer rewrites `Origin` from the host name. The header now only decides
  whether the browser may read the answer: the app (`APP_ORIGIN`) and `localhost` may, other sites
  get no CORS headers. The web image has to be rebuilt for the nginx change
- The per-address login and reset limits could be sidestepped in production by anyone on a private
  network (an office network, a VPN): the API believed every private address in the
  `X-Forwarded-For` header, so a client could claim a new address with each request. That gave an
  attacker 40 failed guesses instead of 10 on one account, and once the account-wide limit of 50
  was reached it locked the real owner out from every address; unknown-name logins also got past
  the per-address cap, each costing a password hash. `docker-compose.prod.yml` now requires
  `TRUST_PROXY`, the number of proxies in front of the API (`1` when people reach nginx directly,
  `2` behind a TLS proxy such as Caddy), so only those proxies are believed. **Existing production
  setups must add `TRUST_PROXY` to `.env`**: `docker compose` refuses to start without it, and an
  API started in production without it logs a warning
- The mail server login (user and password) is only sent over TLS. The API used to start the
  connection in plain text and upgrade only if the server offered STARTTLS, so a network attacker
  who removed that offer received the login in the clear. It now requires STARTTLS (or uses TLS from
  the first byte on port 465) and gives up instead. `EMAIL_REQUIRE_TLS=false` allows a plain
  connection to a mail server or test mail catcher on the same machine; the development compose
  file sets it
- The development stack (`docker-compose.yml`) publishes its ports on `127.0.0.1` only. It has a
  known database password (`root` / `custoro`), a default `JWT_SECRET` and public demo logins, and
  used to be reachable from the whole network
- A keyword search uses at most 8 words, each cut to 64 characters; further words are ignored. Every
  word is a `LIKE '%word%'` on several columns, and the number of words was unlimited (the URL limit
  allows thousands): 1000 words took 3.1 s on 50 000 invoices and 3000 words 1 s on 2000 customers, so
  any logged-in user could keep the database busy
- The users and settings pages are now admin-only in the web app at the route, as they are in the API.
  A regular user who typed `/user/1/0/` got the empty "New user" form with a role selector, and Save
  answered 403 without a word; the user list also asked the API for users before it checked the role.
  Every one of these URLs now shows the 404 page to anyone but an admin and sends no request. The API
  already refused all of it, so no data was exposed
- The web app's Sentry scrubbing removed password reset tokens from what it sends but not the public
  PDF link: `/pdf/<hash>` opens an invoice without a login, and Sentry records page URLs and the
  request for the PDF in errors, traces, breadcrumbs and replays. The hash is now replaced there too,
  as the API already did. Error tracking in the web app is only active when `VITE_SENTRY_DSN` is set
  when the app is built
- Web dependencies: `dompurify` 3.4.17, `i18next-http-backend` 4.0.10 and `follow-redirects` 1.16.2
  close the three advisories `npm audit --omit=dev` reported (DOMPurify option bypasses, the language
  in the translation URL, redirects in Node's HTTP client). None could be reached with how the app
  uses them: the three places that sanitize HTML use the default settings, the translation path
  has the language between slashes and only `en`, `et` and `fun` are loaded, and the browser build of
  axios does not use `follow-redirects`. `npm audit --omit=dev` now finds nothing
- The web app loaded its font from Google's servers, on every page including the public invoice
  page that a customer opens from the email link: each visit sent the visitor's address to Google,
  and the Content-Security-Policy had to allow two Google hosts for styles and fonts. Roboto (Latin
  and Latin Extended, so Estonian letters work) is now part of the build, the page loads nothing from
  another site and the policy allows none for styles, fonts or images. **Existing production setups
  must rebuild the web image**

### Fixed

- `custoro.sh` could not log in to the database on Zone.ee: the hosting account's own `~/.my.cnf`
  (the database host, an empty user and password) overrode the script's login, so the first
  install stopped with "Access denied for user '<account>'@... (using password: NO)". The
  database client now reads only the script's own login. A database the script cannot reach is
  no longer taken for an empty one: it stops before loading the schema. On a host that sets
  `NODE_ENV=production` for its accounts (Zone.ee does), the install left out the migration tool
  (a dev dependency) and stopped at "No such driver found"; it now always installs it for the
  migrations, and the migrations never download another version of it. **On a server installed
  with 5.0.0-rc.2, run the next update with a freshly downloaded `custoro.sh`**, not
  `~/custoro/current/deploy/custoro.sh`, since that copy still has the old login
- An account whose email was saved on the users page with spaces around it (`" ann@…"`) could
  never log in or get a reset email: the login looks the address up without them. The users page
  now stores it without spaces, and a new migration trims the accounts saved before; it stops with
  a list if a trimmed address belongs to another account. **Existing databases must run the new
  migration** (`20261108100000-trim-usernames`)
- A user whose email has an apostrophe or an ampersand (`o'brien@…`, `sales&co@…`) could never
  log in or get a reset email: the login and the forgot-password form escaped the address
  before looking it up (`o\'brien@…`), so no account matched. The address is now looked up as
  typed, only without surrounding spaces
- Invoice PDFs downloaded their font from Google (`fonts.gstatic.com`) whenever the API started,
  so a server that cannot reach Google, or a day the address moved, made no invoice PDF at all
  ("PDF generation failed") and no invoice could be emailed. The two Roboto files are now part of
  the API image (`apps/api/assets/fonts`, Apache License 2.0) and nothing is downloaded. **Rebuild
  the API image**
- Invoice totals did not always add up. The PDF and the invoice screen added the lines as floating
  point numbers and rounded only what they printed, so two lines of 1.5 h at 33.33 printed 49.99 +
  49.99 with a net of 99.99, and 45.11 net + 10.83 VAT printed a total of 55.93. Of 99 000 tried
  two-line invoices, a quarter printed a total a cent off net plus VAT and half printed lines that
  did not add up to the net. Now each line is rounded to cents (half away from zero), the net is
  the sum of the printed lines, the VAT is the net times the rate rounded to cents, and the total
  is net plus VAT, the same rule in the PDF and on the screen (one list of test cases for both).
  Unit prices are shown with the decimals they have (up to 4) instead of cut to 2. A PDF made
  again for an existing invoice, paid ones included, can show a total one cent different from
  the PDF made before
- Two invoice PDFs made at the same moment in different languages could mix their texts: the API
  switched the language of the whole server for each PDF. Each PDF now gets its own texts, and a
  language the app does not have gives English
- The app did not record when an invoice was emailed, although the database has a column for it.
  Now a sent invoice keeps the date of its last email and shows "Emailed <date>" next to the send
  button. Emailing an invoice that has no customer answers "no customer" instead of a server error
- Emails went out without a sender when `EMAIL_FROM` was not set (the admin settings page has no
  field for it): no From line and an empty envelope sender, which many mail servers refuse or
  file as spam. The mail server login is used as sender now when it is an email address; set
  `EMAIL_FROM` for another one
- A paid (locked) invoice could still be changed through the API: lines added, removed or given
  another quantity, and its number, date and customer changed. The API refuses that now ("This
  invoice is paid and locked"), checked with the invoice row locked so it cannot be marked as paid
  halfway through a change. Changing an invoice's details and its worksheets' customer is one
  transaction, and so is marking it as paid
- Paid invoices kept no copy of their customer: when a customer moved or changed name or VAT number,
  every old invoice showed and printed the new details, and its due date followed the customer's
  current payment period. An invoice now copies its customer's name, registration and VAT number,
  address, phone, email, department and payment period when it is marked as paid, and shows and
  prints that copy; the invoice list shows the name it was billed to and finds it by either name.
  Open invoices follow their customer as before. **Existing databases must run the new migration**,
  which adds the columns and fills them for the invoices that are already paid, from the customers
  as they are now (50 000 invoices: 2 s on MySQL 8.4, 1 s on MariaDB 11.4). It stops on nothing
- A paid invoice of a customer with a foreign VAT number showed 24% VAT in the app while its PDF had
  none; the app now takes the VAT number from the invoice's copy of the customer
- The mail server settings saved on the admin page were read back with dotenv, which cut a password
  at ` #`; they lived in `/app/.env.email`, in no volume, so a new API container lost them; and
  after any restart the empty `EMAIL_*` variables the production compose file sets won over them.
  They are kept as JSON in the invoices volume now (`/app/storage/mail-settings.json`, readable only
  by the API), so they are in every backup, keep any password as typed and win over `EMAIL_*`; a
  setting the page has not saved still comes from `EMAIL_*`. An existing `.env.email` is read until
  the settings are saved once, then removed. A failed save now says so instead of reporting success
- The web app ends the session when the API refuses the login token (it expired, or the password or
  email was changed elsewhere): it logs the user out, goes to the login page and says the session
  expired. The API answers such a request with HTTP 200 and `success: false`, which the app ignored,
  so lists never loaded and forms looked as if they had saved
- Invoices created at the same time no longer get the same number: the next number is reserved and
  the invoice inserted in one transaction, and invoice numbers have a unique index. **Existing
  databases must run the new migration**, which stops and lists any duplicate numbers that need to
  be resolved by hand first
- Invoices are only made VAT-free for a real foreign VAT number. Placeholders such as "N/A", Estonian
  numbers typed in lowercase or with spaces, and malformed numbers used to drop VAT too. EU numbers
  are checked against their country's format; the web form and the PDF share one tested rule
- The invoice screen uses the VAT rate stored on the invoice, like the PDF, so changing the VAT setting
  no longer changes the totals shown for existing invoices
- Removing a profile picture or a user's avatar works again; since the Express 5 upgrade the API
  crashed on the web app's DELETE request because it has no body
- "Forgot password" and "Create new password" work again: the web app called URLs with a double slash,
  which the API answered with 404
- Passwords containing quotes, `&`, `<` or `>` can log in: login no longer escapes the password before
  comparing it with a hash that was made from the password as typed
- New passwords (reset and profile) must be 8 to 72 bytes long; bcrypt ignored anything past 72 bytes
- Login tokens use `JWT_EXPIRES_IN` instead of a fixed 24 hours
- Removed a sanitizer step that never ran and an unused "auth message" notification in the login page
- An admin can create users again: the "create user" statement left out `users.token`, `users.theme`
  and `users.avatar`, which had no default, so a MySQL server in its default strict mode refused every
  new user ("Field 'token' doesn't have a default value")
- Login emails and customer emails can be as long as an email address can be (254 characters); the
  login email and the customer emails were limited to 45
- Searching with several words finds rows that contain every word. The words were joined without
  parentheses (`a OR b AND c OR d`), so any row that matched the first word was returned. A search for
  `50%` or `a_b` looks for that text, and a stray `%` no longer ends in an error
- Changing the quantity of an invoice line set the change date of the wrong invoice (the invoice whose
  number equalled the quantity), and a line could be changed through any invoice's URL. It now only
  changes a line of the invoice in the URL, and sets that invoice's change date with it
- The invoice list with a customer and a search word at the same time is no longer a SQL error, and its
  page count is filtered like the page itself (it counted all customers' invoices)
- Changing a customer or a product no longer reports "saved" when the database refused the change; the
  check on the result could never fail
- Invoice numbers that are not plain digits (such as `INV-001`) sort last in a fixed order, instead of
  as 0 in no particular order
- A worksheet that is paid for, or whose line is on a locked invoice, can no longer be deleted: that
  silently deleted the line from an issued invoice. The web app says why
- The routes that save a customer, product, worksheet, user or invoice check the values they are sent.
  A customer name of `{"a":1}` was stored as the text "[object Object]", and a product code of
  `[["x"]]` was expanded into SQL by the database driver (the values are escaped, so this was bad
  data, not injection). Texts must be text (or a number) no longer than their column, numbers must be
  numbers that fit their column, also after the database has rounded them (a quantity of 999999999.9996
  would round up past DECIMAL(12,3); prices and quantities may use a comma), and units, roles, payment
  types and invoice types
  must be one of the column's values; otherwise nothing is saved and the web app says "some values are
  not valid". The query helper also refuses any list, object or `undefined` as a parameter. Saving a
  customer, worksheet or user changes the one in the URL, not the id in the body. An invoice without
  a customer can be saved again (it failed because its payment period was set to NULL), and an invoice
  is not saved for a customer that cannot be read, which would have kept the old customer's payment terms
- An id in a URL must be a positive whole number. MySQL reads the leading digits of a text, so
  `/customer/1%20OR%201=1` and `/customer/1;DROP%20TABLE%20users` returned (or changed, or deleted)
  customer 1 and `/customer/1e3` customer 1000. The customer, product, worksheet, user, invoice and PDF
  routes now answer `success: false` ("We encountered an error") for such an id without querying,
  before any upload is written
- A request body over 100 KB is answered with HTTP 413 and malformed JSON with 400 (`success: false`,
  without quoting the body); both were an error 500. Changing, deleting or clearing the avatar of a
  user that does not exist, and a list whose count query failed, answer `success: false` instead of
  ending in a TypeError and an error 500
- Creating an invoice, saving the invoice counter and the other all-or-nothing saves answer with their
  usual error when no database connection can be had (the database does not answer, or the queue of 100
  waiting requests is full) instead of ending in an error 500; a logo uploaded with such a save is
  removed
- The PDF of an invoice without a customer was addressed to the customer whose id equals the invoice's
  (the id in the URL), because the customer lookup fell back to the path's id. An invoice without a
  customer has none now, and the PDF says so instead of failing inside the template. Reading a paid
  invoice without a customer keeps working
- Creating or changing a user with an email that another request took a moment earlier says "User with
  this email already exists", like the check before it does. Ten requests at once with one address gave
  one user and nine generic errors, because only the database's unique key stopped the others. The avatar
  of a refused request is removed too
- The invoice counter (Settings, "Last Invoice ID") could be set below numbers that invoices already
  have, after which every new invoice failed with a generic error (the next number was taken). The next
  number is now one more than the larger of the counter and the highest number on an invoice, so a
  low counter repairs itself, and Settings refuses a counter below the highest number in use ("The last
  invoice ID cannot be lower than..."). The Settings page sends the counter it loaded along with every
  other change, so a page that was open while invoices were created is refused until it is reloaded,
  instead of silently setting the counter back. The counter is handled as the exact digits it has (a
  number past 15 digits used to be rounded, which handed the same invoice number out twice) and Settings
  accepts up to 18 digits (the longest number the app hands out, the digits the invoice sort column
  holds), where it took 9, so an invoice numbered `2026000001` no longer makes every Settings save
  fail. Settings checks the counter and saves in one transaction that
  locks the counter row first, as creating an invoice does, so an invoice created at that moment can no
  longer be followed by a save that sets the counter below its number; a logo uploaded with a refused
  save is removed. The highest number in use is read from the sort column's index, one row, however
  many invoices have numbers such as `INV-001`. The app stops handing out numbers after 18 digits; a
  longer number typed in by hand can never be the same as one it gives out. An invoice number is saved
  without spaces at its ends, and a number the database's unique key counts as taken without it being
  the same text (`42 ` with a space, or 42 written in the digits of another script, which the
  collation reads as 42) is skipped when the next number is handed out, a few at most, instead of
  failing every new invoice
- Password reset and invoice emails got the wrong parts: the subject, text and HTML of an email were
  assigned by the position of the settings rows in the database's answer, and since the unique key on
  `config.name` (the 2026-10-19 migration) MySQL answers in alphabetical order, so the HTML became the
  subject, the subject the text and the text the HTML. Each setting is now matched by its name
- On the reset-password page, a new password the API rejected (`passwordLength`) left the Save
  button disabled, so only the Enter key could send another one. Save is now disabled only for a link
  the API does not accept (unknown, used or expired). The English text for two passwords that differ
  said "mach" instead of "match"
- The last admin can no longer be deleted or made a regular user, which left nobody able to manage
  users or settings (and a production install had no way to make a new admin). The API refuses it
  with a message, also when two admins delete each other at the same moment. A deleted user's avatar
  file is now removed only after the user is gone
- Stopping the API (`docker compose stop`, a redeploy, Ctrl+C) now lets the requests that are running
  finish, for up to 25 seconds, before the process ends. It used to ignore the stop signal and was
  killed (exit code 137), which cut off whatever it was doing, such as a PDF or an email. The
  production compose file gives the API 30 seconds to stop, and keeps each service's container log to
  5 files of 10 MB, where Docker on a Linux server keeps one file that grows without limit
- The settings page sent every setting on each autosave, including the invoice counter it had loaded
  when the page opened. Once anyone created an invoice meanwhile, the API refused the old counter
  (`lastInvoiceIdTooLow`) and with it every later save, and the autosave failed without a word, so
  edits to the VAT, company details or email texts were lost on leaving the page. It now sends only
  the settings that were changed (the counter only when it is edited, the logo only when a new file
  is picked), sends nothing when nothing changed, and shows the error when the API refuses an
  autosave. A refused change is sent again with the next one
- Saving a new logo with no other setting changed failed with `put.settings.short`: the API built
  `WHERE name IN (, ?)` when the file was all there was. The settings page always sent every setting
  with the file, so it never showed; it now sends only what was changed, so the API takes a logo
  alone. **Existing production setups must rebuild the API image** together with the web image
- A new product saved with its unit left at the default failed in Estonian: the form sent the
  Estonian label of the unit ("tk") instead of its value ("pc"), and the API answered `invalidInput`,
  so the product could only be saved after picking a unit by hand. The form now sends the value in
  every language
- After the API limited the logins (10 failed attempts in 15 minutes), the web app replaced the whole
  login page with the "We encountered an error" page: no form, no reason, and the person had to
  reload. A refusal by the API (on the login, forgot-password and reset-password pages) now stays on
  the form with a text in the language of the page ("Too many attempts. Please wait a while and try
  again"); only a request nobody answered or a server error still shows the error page. An answer
  without a body no longer breaks the error handling either
- Logging in could leave the person on the login page, signed in but not forwarded: the page they
  were on before (kept in `lastUrl`) can be a path such as `//example.com/x`, which the router refuses
  to open (it throws "External navigation is not allowed"). The web app now goes back only to a path
  of its own and otherwise to the home page. It was never an open redirect
- The web server sent `index.html`, the translation files and `CHANGELOG.md` without `Cache-Control`,
  so a browser could keep them for hours (a share of the time since `Last-Modified`). After an
  update the old page pointed at build files that no longer exist and showed a blank page until a
  hard reload. These files now carry `Cache-Control: no-cache`: the browser asks each time and gets a
  304 when nothing changed. The fingerprinted files under `/assets/` are still cached for a year.
  **Existing production setups must rebuild the web image** (`docker compose -f
  docker-compose.prod.yml up -d --build web`)

### Changed

- Error tracking in the browser can be switched on for the production web image: set
  `WEB_SENTRY_DSN` in `.env` (the DSN of a browser project in Sentry) and rebuild the web image.
  Before, the image had no way to take it, so browser errors were never reported. When it is on,
  a tenth of the page loads are traced in production (all of them were), and screen recordings
  are only kept of sessions with an error, with text and inputs masked (a tenth of all sessions
  were recorded). The prebuilt images of a release have it off
- The customer and product pickers (an invoice's customer, a new invoice line, a worksheet's
  customer and product) search as you type and show the first 20 matches, instead of loading every
  customer and product when the page opens. A list asked for without `page` and `limit` now answers
  with one page of 20 rows; it answered with up to 1000
- CI has three more checks: the schema drift check on MySQL 8.4 and MariaDB 11.4, the Playwright
  `api` suite against the dev stack, and the `docker` job now starts the production stack, runs the
  migrations and checks through nginx that the app, the API, a login, `no-store` and the CORS rule
  answer as they should
- API runs on Express 5, which handles errors from async routes itself; `express-async-errors` is gone.
  Also dotenv 18, i18next 26 and TypeScript 6
- Web app on react-router 8, MUI 9, react-day-picker 10 (date-fns is no longer a direct dependency),
  Tailwind 4 with a CSS-based theme, Vite React plugin 6, i18next 26 / react-i18next 17, vitest 5,
  TypeScript 6 and ESLint 10 with a flat config, matching the API
- Five issues the stricter lint rules found are fixed: two always-true fallbacks on product labels, a
  user avatar component re-created on every render of the users list, and two stale disable comments
- TypeScript stays on 6.0 for now: TypeScript 7 has no compiler API yet, so typescript-eslint cannot
  run on it
- **Database structure** (new migrations, `apps/api/db/01-schema.sql` is brought up to date; MySQL 8.4 and
  MariaDB 11.4 are both tested, a fresh install and an upgraded database end up identical).
  **Existing databases must run the new migrations** (see `apps/api/db/README.md`); take a backup first.
  They stop with a list, and change nothing further, if the data has duplicates or orphans that need a
  person's decision: the same product code, setting name or invoice hash twice, a row that points at a
  customer, product, worksheet or invoice that does not exist, or two values that only differ by what
  the new collation ignores
  - Indexes on the columns the API looks rows up by (`invoice_items.invoice_id` and `worksheet_id`,
    `invoices.customer_id`, `worksheets.customer_id` and `invoice`, ...) and unique keys on
    `config.name`, `products.code` and `invoices.hash`. With 50 000 invoices and 250 000 lines the lines
    of one invoice took 32 ms and a public PDF link 6 ms because each read the whole table; they are
    now a single lookup. The invoice number counter locked every row of `config` while an invoice was
    being created; it locks one
  - Foreign keys between invoices, lines, worksheets, customers and products. A customer who has
    invoices or worksheets, and a product that worksheets use, cannot be deleted (the web app says so);
    a product that is only on invoice lines can be, since each line keeps its own copy of the product's
    code, name and prices. A second product with the same code is refused. "No invoice" on a worksheet
    is NULL instead of 0
  - Prices, quantities and the VAT rate are `DECIMAL` instead of `FLOAT`/`TINYINT`, so amounts are
    stored as written (3 x 19.99 is 59.97, not 59.96999931). The API still returns numbers
  - All tables are `utf8mb4_unicode_ci`; `products` was `utf8mb3`, which refused an emoji or any other
    4-byte character in a product name
  - `invoices.number_sort` (the number as a number) orders the invoice list from an index
- Creating an invoice is all or nothing: the number, the invoice, its lines and the billing of its
  worksheets are saved in one transaction. A product that does not exist, or a worksheet that is already
  on an invoice, now refuses the whole request (with the reason) instead of leaving a half-built invoice
  and a used number. Adding a line to an invoice and removing one are transactions too
- Hardening of the queries and the database connection, without changing what they return: the
  settings an email needs are asked for with placeholders instead of names written into the SQL, a
  keyword search can only be for one of the five searchable tables, the single invoice and single
  worksheet queries name their columns instead of `SELECT *` and the single invoice lookup lost an
  unused branch. The connection pool gives up on a database that does not answer after 10 s, keeps idle
  connections alive, and lets at most 100 requests wait for a free connection (it was unlimited). The
  "last seen" time of a user is only written when it is more than 5 minutes old, not on every profile
  request
- The invoice list takes 1 ms instead of 258 ms with 50 000 invoices: it counts lines for the rows of the
  page only, instead of joining and grouping every invoice
- The worksheets overview (customers with worksheets, newest first) takes 11 ms instead of 53 ms with
  100 000 worksheets, and its page count 1 ms instead of 108 ms: the worksheets are grouped on the
  (customer, id) index alone and only the page's 20 customers are looked up afterwards. The page count
  is the number of customers with worksheets, which is how many rows the list has; it counted distinct
  customer names, one short for every pair of customers with the same name. A search by customer name
  is unchanged
- Deep pages of the invoice list are cheap: page 1350 of 2500 (50 000 invoices) takes 3 ms instead of
  28 ms. The page's 20 invoices are picked from the number index alone and only they are joined
  to their customers and get their line count, so the cost no longer grows with the page number. The
  first page was already instant (0.06 ms) and a keyword search, which has to look at the customers'
  names, is unchanged

## 4.0.0 - 2026-10-02

First release from the combined repository.

### Changed

- API and web app live in one repository with a single version number (was API 3.0.5, web 3.0.16)
- Dependencies updated, unused packages removed, peer resolution fixed (#1)
- Repository is public; the README marks the app as not production ready until the security work is done

### Security

- A thrown error in an async API route no longer crashes the API process
- Invoice PDFs are stored outside the public uploads folder, so they can no longer be downloaded by
  counting invoice numbers; the public link hash is generated on the server and survives regeneration
- Avatar and logo uploads accept only validated PNG, JPEG, GIF and WebP images up to 5 MB, and the
  uploads folder is served with headers that stop a browser from running anything from it
- Mail server settings are returned to and accepted from admins only
- Profile updates and avatar deletes always apply to the logged-in user, never to an id sent by the client

---

## Pre-monorepo history

Until October 2026 the API and the web app were separate repositories with their own version
numbers (API up to 3.0.5, web up to 3.0.16). Their logs are kept here as they were written; only the
formatting was normalised.

### API

3.0.5 - 2026.05.27

- KAN-131 Product dropdown shows & searches by code too
- KAN-145 Variables naming convention

3.0.4 - 2026.05.21

- KAN-134 - TS refactor - helpers
- KAN-136 - TS refactor - products
- KAN-137 - TS refactor - customers
- KAN-138 - TS refactor - worksheets
- KAN-139 - TS refactor - invoices
- KAN-140 - TS refactor

3.0.3 - 2026.04.30

- KAN-129 Fetching items limit
- KAN-133 Search items limit

3.0.2 - 2026.04.26

- KAN-127 Fix customers fields

3.0.1 - 2026.04.24

- KAN-121 Updated Customers structure + migration scripts

3.0.0 - 2026.04.01

- KAN-102 Warn about existing product code
- KAN-103 Worksheet fixes
- KAN-109 Move API to use SQL pool

2.0.9 - 2026.03.18

- KAN-105 Automatic deploy

2.0.8 - 2026.03.11

- KAN-89 Migration scripts
- KAN-73 Fixed Invoice racing condition, refactored Invoice

2.0.7 - 2026.02.26

- KAN-51 Using TS on API
- configuration updates

2.0.6 - 2026.02.23

- KAN-40 Implement linter and code quality
- KAN-56 Implement react query
- KAN-60 Fix key error on API index request (version info)

2.0.5 - 2026.01.15

- KAN-30 adjust image delete, rename PDF field

2.0.4 - 2025.12.18

- KAN-27 fix invoice date format

2.0.3 - 2025.12.17

- KAN-20 allow invoice email to have link and fix settings saving
- Fix invoice logo fetching
- KAN-23 fixed price type conflict

2.0.2 - 2025.12.11

- KAN-11 fixed search pagination
- KAN-24 fix PFG generation, code cleanup

2.0.1 - 2025.12.02

- KAN-19 - optimized code + customer fetching fix

2.0 - 2025.11.27

- Moved to JWT

1.6.17 - 2025.10.14

- Fix CORS issue in prod

1.6.16 - 2025.10.09

- Refactored settings saving due to it moving to different tabs layout
- Users have level now

1.6.15 - 2025.10.08

- Forgot password

1.6.14 - 2025.09.22

- Invoice generation checks folder and creates one if check fails
- Invoice filename prefix comes from settings

1.6.13 - 2025.09.19

- Searching SQL error fix

- 1.6.12 - 2025.09.18

- Removed legacy code (orders)
- Some small touch-ups
- Fix uploads access, try to create folder if not existing

1.6.11 - 2025.08.12

- Fix logo path for invoices

1.6.10 - 2025.07.14

- Fetch customer orders correctly

1.6.9 - 2025.06.16

- ENV variables renaming as while moving to Windows USERNAME returns Windows username instead env variable value

1.6.8 - 2025.04.21

- Fix "empty" invoice saving

1.6.7 - 2025.04.17

- More functionality merging
- Allow new "empty" invoice to be added

1.6.6 - 2025.04.16

- Better user notification with responses - customer, products

1.6.5 - 2025.04.07

- Fix incorrect due date on invoice

1.6.4 - 2025.04.04

- Using better crypto to mask passwords
- Removed md5 library

1.6.3 - 2025.03.31

- Invoice takes correct language
- Fix quote usage in fields
- Cleanup

1.6.2 - 2025.03.28

- Invoice/Offer as type
- Better error handling
- VAT number and adjust invoice based on that/offer

1.6.1 - 2025.03.27

- Save avatar and merge file functionality

1.6 - 2025.03.25/26

- Saving email settings + config
- PDF sending with email (test with Zone.ee)

1.5.5 - 2025.03.20

- Saving settings returns real logo url instead null

1.5.4 - 2025.03.05

- Better PDF fetching + cleanup

1.5.3 - 2025.03.04

- PDF is now generated by backend and passed as file to frontend when asked

1.5.2 - 2024.12.31

- Set correct path for prod usage

1.5.1 - 2024.12.13

- Allow , and . on prices and quantity

1.4.1 / 1.5 - 2024.12.12

- Allow saving settings without image file
- Add "discount" fields for special users
- Rename SQL fields for correct code
- 1.5 as release version

1.4 - 2024.12.10

- Worksheets, invoices, PDFs reworked

1.3.4 - 2024.10.18

- Fixed login logic so failed login will not hang

1.3.3 - 2024.10.15

- Fixed integer/string error while sanitizing input
- Code updates

1.3.2 - 2024.10.11

- Allow Profile have Theme
- Customers list can be ordered

1.3.1 - 2024.10.05

- Demo config was missing
- Starting to rename the project as we need to go a bit more open now
- Fixed Product adding query - now it returns last added ID

1.3 - 2024.10.03

- Bigger config upgrade - DBs are now stored in keystore to allow multiple systems on single APIl

1.2.10 - 2024.10.02

- Move keystore to .env file

1.2.9 - 2024.09.25

- Moving prod config into .env file

1.2.8 - 2024.05.09

- Fixed bug product not saving with partially missing data

1.2.7 - 2024.04.05

- Query fail has now descriptive message

#### [Release] @ 2024.04.04

1.2.6 - 2024.02.02

- "Funnier" message while DB is down

1.2.5 - 2024.01.11

- Fix price format on search

1.2.4 - 2024.01.09 / 2024.01.10

- Add new product, query single and multiple ones
- Update and delete product
- Search products
- Cleanup

1.2.3 - 2023.11.24

- Allowing to select orders without owner id

1.2.2 - 2023.11.17

- Much code cleaning and requests have now common method + better protection

1.2.1 - 2023.10.03

- Unable to get env variables in production with PM2 so switching prod as default env

1.2 - 2023.09.22

- Config changes to get PM2 to work. Env variables is lost on restarts on server side

1.1.2 - 2023.07.03

- Fix new order customer save

1.1.1 - 2023.06.30

- RC fix for total count
- 1.1 - 2023.06.30

- Release version, another milestone

1.0.7 - 2023.06.30

- Fix getting orders total
- Removed total limit for search

- 1.0.6 - 2023.06.29

- Swapped company field to reg number
- Added nickname to search fields

1.0.5

- Return correct meta for filtered queries

1.0.4

- #### Search & Products
- Search works with AND operator for customers, customer fetching is combined into single method
- Also added availability for products to be fetched (right now purely copy-paste)

...

### Web

3.0.16 - 2026.05.27

- KAN-130 Header title & buttons are handled by state store
- KAN-131 Product dropdown shows & searches by code too
- KAN-141 Rename styling folder
- KAN-143 Code cleanup
- KAN-144 Fix Playwright test
- KAN-145 Variables naming convention

3.0.15 - 2026.05.21

- KAN-59 Implemented first PlayWright tests
- KAN-124 Using React 19 + Vite
- KAN-142 Fix product delete bug

3.0.14 - 2026.04.30

- KAN-125 Packages cleanup
- KAN-129 Fetching items limit
- KAN-133 Search items limit

3.0.13 - 2026.04.24

- KAN-121 Customers structure update

3.0.12 - 2026.04.01

- KAN-102 Check product code if it is already existing
- KAN-103 Fix worksheets
- KAN-107 Fix logging out redirect
- KAN-108 Fix notification showing
- KAN-109 Support new API SQL pool usage
- KAN-115 Convert first Context to Zustand
- KAN-119 Add new site to deploy pipeline

3.0.11 - 2026.03.18

- KAN-91 Fixed missing info on PDF
- KAN-101 Removed API key
- KAN-105 GitHub Action pipeline

3.0.10 - 2026.03.11

- KAN-8 Added migration scripts
- KAN-34 Prices under Products have VAT notification
- KAN-57 General notification element
- KAN-67 Navigation update
- KAN-73 Invoice logic is refactored
- KAN-76 Header is now part of View
- KAN-84 Fixed invoice translations
- KAN-86 Themes are disabled for now
- KAN-89 Fixed long customer address saving
- KAN-90 fixed invoice dropdown visibility

3.0.9 - 2026.02.26

- KAN-68 Fix invoice date picker visibility
- KAN-69 Fix invoice vs offer toggle visual
- KAN-65 Remove app.config from repo
- KAN-64 Update package.json
- KAN-72 Invoice items are auto-saved
- KAN-75 Use BigError on dead API
- KAN-54 Fix WPC page redirections
- KAN-48 List views no longer have "..." menu, replaced with "delete"
- KAN-80 Forms save with "enter" button
- KAN-82 PDF action button are disabled when needed

3.0.8 - 2026.02.23

- KAN-40 Implement linter and code quality
- KAN-56 Implement react query
- KAN-58 Disable search feature
- KAN-61 Fox 401 error on logout
- KAN-62 Refresh worksheets list on WPC view on add/delete

3.0.7 - 2026.01.15

- KAN-30 fix issues adding and changing items (products, users etc)
- KAN-28 hide navigation on pages that don't use it
- KAN-30 fix entities not saving on adding or updating (customer, product, worksheet)

3.0.6 - 2025.12.18

- KAN-23 code cleanup
- KAN-27 fix invoice date format and saving

3.0.5 - 2025.12.17

- KAN-26 fix settings saving, added help text
- KAN-23 more code cleanup for types

3.0.4 - 2025.12.11

- KAN-11 - fixed search pagination
- KAN-24 - remove not required request, fix title

3.0.3 - 2025.12.10

- KAN-20 - Moved buttons to header

3.0.2 - 2025.12.02

- KAN-19 - Page title moved to header

3.0.1 - 2025.11.28

- KAN-14 - show ChangeLog to users
- KAN-16 - keep navigation on view even if page content is long

3.0 - 2025.11.27

- Moved to JWT
- KAN-4 fix
- KAN-13 fix for Modal

2.1.4 - 2025.10.09

- FEA2 - Settings saving with API 1.6.16
- Fixed bug rendering locked invoice - customer was loaded after render
- Tabs styling

2.1.3 - 2025.10.08

- Restore password with API 1.6.15
- FEA1 - refactoring

2.1.2 - 2025.09.22

- Added spice (salt) to password, so it is passed in nicer way
- Updated CSS for RTE Color theme
- Invoice filename prefix is now a setting

2.1.1 - 2025.09.18

- Switch RTE editor

2.1 - 2025.09.12

- Minor CSS fix with better error handling
- Preparing for DEMO env

2.0.11 - 2025.07.14

- Fix SASS rules
- Show customer invoices under customer view & remove all additional tabs under new user

2.0.10 - 2025.06.27

- Some React warnings fixes

2.0.9 - 2025.06.17

- As we are moving away from Mac I need to push the changes
- Refactoring SASS files to drop @import

2.0.8 - 2025.04.29

- General code cleanup and upgrade
- Better search closing

2.0.7 - 2025.04.21

- Fix invoice view

2.0.6 - 2025.04.17

- Allow new "empty" invoice to be added

2.0.5 - 2025.04.16

- Cleanup
- Better user notifications for actions - customers

2.0.4 - 2025.04.04

- Better crypto library for passwords

2.0.3 - 2025.03.31

- Send language for PDF
- Cleanup
- Fix avatar disappear on profile save
- Nicer 404 page

2.0.2 - 2025.03.28

- Cleanup
- Better error handling
- Offer/Invoice as type
- Fix customers adding/updating
- VAT number

2.0.1 - 2025.03.27

- Navigation visual update
- Avatar for user

2.0 - 2025.03.26

- Invoice sending (based on Zone.ee) working

1.5.11 - 2025.03.25

- Preparing for email system, configs are now editable
- Some minor UI updates
- Fixed path fetching bug

1.5.10 - 2025.03.19/20

- Code cleanup

1.5.9 - 2025.03.05

- Created broken PDF view
- PDF are created and fetched correctly
- UI updates

1.5.8 - 2025.03.04

- Fix PDF hash setting and calling out PDF

1.5.7 - 2025.02.27

- Reworked PDF solution so API will generate and provide it

1.5.6 - 2025.01.31

- Fixed authentication so it will now always set theUser
- Added customer worksheets button under customer
- Adjusted textarea CSS
- Deleted Order as it is deprecated

1.5.5 - 2025.01.14

- Happy New Year
- Fixed .discount being undefined

1.5.4 - 2024.12.31

- Add reg number to invoice, make invoice as link in worksheets view
- Fix redirect for worksheet

1.5.3 - 2024.12.13

- Allow quantity and prices fields use , and .

1.5.2 - 2024.12.12

- Special users have "discount" view

1.5/1.5.1 - 2024.12.10

- Worksheets, invoices, PDF
- Fix login navigation

1.4.4 - 2024.10.22

- Estonian translation
- Fixed Navigation so translations will not be hardcoded
- LESS cleanup
- Axios update

1.4.3 - 2024.10.18

- Fixed login issue with non-existing user
- Login screen has field validation now
- Code cleanup and removed unused npm library

1.4.2 - 2024.10.15/16/17

- Compact view will not include Pagination
- Translations
- More centralized error handling
- Adjust order table
- Name change

1.4.1 - 2024.10.14

- Incorrect password created loop, now fixed
- Updated error styling in Modal

1.4 - 2024.10.11

- NEW visual layout
- Name change to Custoro
- New Flat theme as default
- Adjusted Color theme
- Fixed SASS errors - math.div instead just slash calculation
- Moved to localStorage instead sessionStorage so sessions will be shared
- Theme selecting under Profile
- Dashboard shows 5 latest (Customers are ordered by ID)

1.3.1 - 2024.10.03

- Update favicon
- Small cleanup
- Order item shows value if it is not separate Product

1.3 - 2024.09.11

- Products are manageable
- Order will now accept products

1.2.6 - 2024.05.09

- Bugfix for delete button not passing event
- Bugfix for stuck loader loop on new order creating
- Bugfix customer list after adding new one from select

1.2.5 - 2024.04.04/05

- Show loader on pagination and in Order
- Styling update
- Fix error on picking already active date in Order

#### [Release] @ 2024.04.04

1.2.4 - 2024.04.02/03/04

- Finally error handling on login form
- Delete order button is now in order details view
- mobile styling support

1.2.3 - 2024.02.02

- Shipping prices are strings
- New customer adding is possible under order

1.2.2 - 2024.01.111

- Fix Products search clean on Escape key press
- Fix compilation errors (SASS & TSX)

1.2.1 - 2024.01.09 / 2024.01.10

- Some uncommitted code again...
- Products view - add, update, delete, search
- Close modal on Escape key press
- Added VAT as variable

1.2 - 2023.11.24

- Refactoring orders to allow no customer saving. Orders will be collection of products and Invoices will be stored separately

1.1.6 - 2023.11.03

- Starting with products view

1.1.5 - 2023.11.01

- Profile now uses Modal (preparation for Products)

1.1.4 - 2023.11.01

- Refactored Modal to Confirmation that is correct naming
- Reusing Modal now got login/error/404

1.1.3 - 2023.10.05

- Finally managed to create pm2 json that can be started by manager

1.1.2 - 2023.07.05

- Fix prod not rendering customer edit view - moved value registering into useEffect hook

1.1.1 - 2023.07.03

- Added safe-loops in case order inserting fails

1.1 - 2023.06.30

- RC version
- Switched to md5 TS version as prod has issues with regular md5

1.0.4.4 - 2023.06.30

- Show message on empty entry set

1.0.4.3 - 2023.06.29

- Fix login fields showing after logging in
- Fix null in url when adding new resource (order, customer)
- Remove customer name from orders under customer view - not needed, and then we don't need to update the list on customer data change
- Fix invoice view being too small
- Fix profile form visual
- Added registration number to invoice

1.0.4.2 - 2023.06.08

- Fix save on date change - customer ID was not set and thus SQL failed

1.0.4.1 - ???

- Starting to move away from tables and use grid instead. Order done

1.0.3 - 2023.06.02

- search for customers/orders

... lost in history. 1.0.0 was first PROD release

0.8.0 - 2022.07.08

- mayor update to use the same login logic as SaB (possible should be extracted to make reusable code)

0.7.0 - 2020.08.28

- finally prod ready version with proper SQL for prod

0.6.1 - 2020.05.15

- add/delete will refresh correct list on customers and orders
- fancy updates for visual
- environmental variables, first prod build

0.6.0 - 2020.05.14

- router in use, order works (untested yet)

0.5.0 - 2020.05.01

- items can be added/changed/deleted from order

0.4.0 - 2020.04.17

- redux persist in some action

0.3.0 - 2020.04.12

- login works

0.2.0 - 2020.04.04

- customer CRUD works with express

0.1.0 - ??

- initial setup
