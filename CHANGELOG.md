# Changelog

All notable changes to Custoro, the API and the web app together. Since 4.0.0 both apps share one
version number, kept in each app's `package.json`. The web app shows this file on its changelog page.

## Unreleased

### Added

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

### Security

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

### Fixed

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

### Changed

- API runs on Express 5, which handles errors from async routes itself; `express-async-errors` is gone.
  Also dotenv 18, i18next 26 and TypeScript 6
- Web app on react-router 8, MUI 9, react-day-picker 10 (date-fns is no longer a direct dependency),
  Tailwind 4 with a CSS-based theme, Vite React plugin 6, i18next 26 / react-i18next 17, vitest 5,
  TypeScript 6 and ESLint 10 with a flat config, matching the API
- Five issues the stricter lint rules found are fixed: two always-true fallbacks on product labels, a
  user avatar component re-created on every render of the users list, and two stale disable comments
- TypeScript stays on 6.0 for now: TypeScript 7 has no compiler API yet, so typescript-eslint cannot
  run on it

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
