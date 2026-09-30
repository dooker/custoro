# Database init scripts

MySQL runs every `*.sql` file in this folder, in alphabetical order, the **first time** the database volume is created (both `docker-compose.yml` and `docker-compose.prod.yml`).

> **Not added yet.** Both files below are planned; until they exist the database starts empty.

| File            | Contents                                         |
| --------------- | ------------------------------------------------ |
| `01-schema.sql` | Table structure only (`mysqldump --no-data`)     |
| `02-seed.sql`   | Minimal data: config keys and a first admin user |

To reload locally: `npm run docker:reset`, then start again.

Later schema changes go into `apps/api/migrations/` (db-migrate), not into these files.
