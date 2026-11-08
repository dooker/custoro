# Custoro on a server without Docker

One script, `custoro.sh`, installs and updates Custoro from a release bundle
(`custoro-<version>.tar.gz` on the GitHub release page). The server runs the API with Node 24 under
systemd, and nginx serves the web app and passes `/api` to the API. The database can stay where it
is (for example a hosted MariaDB).

```
browser ──https──> nginx ──/api──> Custoro API (Node 24, systemd, 127.0.0.1:3999) ──> MariaDB
                     └── the web app's files (/opt/custoro/current/web)
```

## 1. Prepare the server (once)

Debian or Ubuntu, with SSH and sudo, and a domain name that points at it:

```bash
# Node 24 (NodeSource packages; or any other way to get node 24 and npm on the PATH)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs nginx mariadb-client certbot python3-certbot-nginx
node -v    # v24.x
```

`mariadb-client` takes the database backup before every update.

## 2. Install

```bash
curl -fsSLO https://github.com/dooker/custoro/releases/download/v5.0.0/custoro.sh
sudo bash custoro.sh deploy 5.0.0
```

The first run creates `/opt/custoro/shared/.env.production` and stops. Fill it in
(`sudo nano /opt/custoro/shared/.env.production`):

| Setting                                                       | Value                                                                                                                                                                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` | the database; the user needs `ALTER`, `INDEX`, `REFERENCES`, `CREATE` and the usual reads and writes                                                                                                                                 |
| `DB_SSL`                                                      | `verify` (default for migrations): TLS with the server certificate checked, `DB_HOST` a host name. `off`: plain, only on the same machine or a private network. `DB_SSL_CA`: the CA file for a certificate not signed by a public CA |
| `APP_ORIGIN`                                                  | `https://your.domain`, the address people open                                                                                                                                                                                       |
| `JWT_SECRET`                                                  | `openssl rand -hex 32`                                                                                                                                                                                                               |
| `TRUST_PROXY`                                                 | `1`: nginx is the one proxy in front of the API                                                                                                                                                                                      |
| `EMAIL_FROM`                                                  | the sender of invoices and password emails; the mail server itself is set on the admin settings page                                                                                                                                 |

Run the same command again. It installs the release, loads the schema if the database is empty,
runs the migrations, starts the API and prints what nginx still needs.

## 3. nginx and HTTPS

```bash
sudo cp /opt/custoro/current/deploy/nginx/custoro-site.conf /etc/nginx/sites-available/custoro
sudo sed -i 's/server_name _;/server_name your.domain;/' /etc/nginx/sites-available/custoro
sudo ln -s ../sites-available/custoro /etc/nginx/sites-enabled/custoro
sudo rm -f /etc/nginx/sites-enabled/default      # if nothing else uses it
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your.domain              # HTTPS, renewed automatically
```

## 4. The first admin (a new, empty database only)

```bash
sudo /opt/custoro/current/deploy/custoro.sh create-admin you@example.com --name "Your Name"
```

It asks for the password. `--reset` gives an existing user a new password and the admin role.

## Moving from an older install

- Point the `DB_*` settings at the existing database: the migrations bring it up to date. If it
  has never had the 2026 migrations, first run
  `UPDATE users SET forgot_token = NULL WHERE forgot_token = '';` (finished password resets of the
  old version left an empty token that the new rules must not see).
- Copy the old app's files into the shared folder, then give them to the service user:
  uploaded pictures into `/opt/custoro/shared/uploads/`, invoice PDFs into
  `/opt/custoro/shared/storage/pdf/`, then `sudo chown -R custoro:custoro /opt/custoro/shared`.
- Stop the old app, and let nginx serve the new site instead.
- Everyone logs in again once (the login tokens changed).

## Updating

```bash
sudo /opt/custoro/current/deploy/custoro.sh deploy 5.0.1
```

It downloads the bundle and checks its checksum, installs it next to the running one, dumps the
database into `/opt/custoro/backups/`, stops the API, runs the migrations, switches over and checks
that the API answers with the new version. If it does not, the previous release runs again. A
bundle file works too: `deploy ./custoro-5.0.1.tar.gz`.

```bash
sudo /opt/custoro/current/deploy/custoro.sh status     # what runs
sudo /opt/custoro/current/deploy/custoro.sh rollback   # the release before
journalctl -u custoro-api -f                           # the API's log
```

## Backups

Every update dumps the database first. For a daily dump, as root (`sudo crontab -e`):

```
0 3 * * * /opt/custoro/current/deploy/custoro.sh backup >/dev/null
```

Copy `/opt/custoro/backups/` and `/opt/custoro/shared/` (pictures, invoice PDFs, mail settings)
somewhere else regularly: a backup on the same disk is lost with it. They hold customer data and
password hashes: keep them private. `.env.production` holds the secrets: keep a copy too.

To restore a dump (stop the API first; everything written since the dump is lost):

```bash
sudo systemctl stop custoro-api
gzip -dc /opt/custoro/backups/db-<time>.sql.gz | mariadb -h <DB_HOST> -u <DB_USERNAME> -p <DB_NAME>
sudo systemctl start custoro-api
```

A dump of a MariaDB server loads into MariaDB, not MySQL (and the other way round).
