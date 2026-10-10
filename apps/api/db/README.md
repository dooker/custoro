# Database init scripts

MySQL runs these files the **first time** the database volume is created.

- **Local development** (`docker-compose.yml`) loads the schema, the seed and the demo data. The files are listed one by one there, so add any new top-level file to that list too.
- **Production** (`docker-compose.prod.yml`) mounts the whole folder and runs every top-level `*.sql` file in alphabetical order. Subfolders are skipped, so it never gets the demo data.

| File                  | Contents                                                    |
| --------------------- | ----------------------------------------------------------- |
| `01-schema.sql`       | Table structure for all app tables                          |
| `02-seed.sql`         | Every config key the app uses, with empty company details   |
| `demo/demo-data.sql`  | Demo company, customers, invoices and two logins (dev only) |
| `demo/demo-logins.md` | Emails and passwords of the demo logins                     |

> **Production has no users yet.** The seed creates no admin, so a production install needs another way to create its first admin.

To reload locally: `npm run docker:reset`, then start again.

> [!WARNING]
> **Never load the demo data into a real or shared database.** It creates an admin whose password is published in this repository, so anyone could log in as admin.

To add the demo data to a local database that was created without it:

```sh
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < apps/api/db/demo/demo-data.sql
```

Later schema changes go into `apps/api/migrations/` (db-migrate), not into these files.

## Upgrading an existing database

The files above only run on an empty database. A database created earlier, including one from before this repository had schema files, needs the migrations. Run them from a checkout of the repository with the API's dev dependencies installed (`npm ci` in `apps/api`), with `apps/api/.env.production` or the `DB_*` environment variables pointing at that database:

```sh
cd apps/api
NODE_ENV=production npm run migrate:up
```

Migrations are written to be safe on a fresh install too, so running them there changes nothing.

In production mode the migrations connect over TLS and check the database's certificate, so `DB_HOST` must be the host name the certificate was issued for. For a certificate from your own CA, set `DB_SSL_CA` to the CA certificate file. MySQL's auto-generated certificates name no host and never pass the check: where the network to the database is trusted (same host, SSH tunnel, private network), run with `DB_SSL=off` instead.

```sh
DB_SSL_CA=/path/to/ca.pem NODE_ENV=production npm run migrate:up
```
