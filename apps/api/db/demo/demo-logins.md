# Demo logins

These accounts exist only in the local development database, which loads `demo-data.sql` on its first start.
Production never loads them. The passwords are public, so never reuse them anywhere real.

| Role  | Email                       | Password              |
| ----- | --------------------------- | --------------------- |
| Admin | `admin@quantumdesk.example` | `TakeMeToYourLedger!` |
| User  | `cadet@quantumdesk.example` | `CadetToMars42!`      |

The admin can change every setting, including SMTP. The cadet is a regular user who sees no discount prices and cannot mark an invoice as an offer. It shows what non-admins see.

Open http://localhost:3000 after `npm run docker:dev`. If the database was created before these users existed, run `npm run docker:reset` first.
