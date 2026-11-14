# Custoro on a server without Docker

One script, `custoro.sh`, installs and updates Custoro from a release bundle
(`custoro-<version>.tar.gz` on the GitHub release page). The server runs the API with Node 24 under
systemd, and nginx serves the web app and passes `/api` to the API. The database can stay where it
is (for example a hosted MariaDB).

```
browser ──https──> nginx ──/api──> Custoro API (Node 24, systemd, 127.0.0.1:3999) ──> MariaDB
                     └── the web app's files (/opt/custoro/current/web)
```

On web hosting without root (Zone.ee), the same script runs the API with PM2 instead and the API
serves the web app itself: see [Zone.ee web hosting](#zoneee-web-hosting) at the end.

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
| `MAIL_SETTINGS_KEY`                                           | `openssl rand -hex 32`: encrypts the mail server password the admin saves; keep it here, not with the backups                                                                                                                        |
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
sudo /opt/custoro/current/deploy/custoro.sh deploy latest    # or a version: deploy 5.0.1
```

`latest` is the newest release on GitHub that has a server bundle, release candidates included.

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

Copy the database dumps (`/opt/custoro/backups/`) and the app's files (`/opt/custoro/shared/uploads`
and `/opt/custoro/shared/storage`: pictures, invoice PDFs, mail settings) somewhere else regularly: a
backup on the same disk is lost with it. They hold customer data and password hashes: keep them
private. **Leave `shared/.env.production` out of that copy**: it holds the secrets, `MAIL_SETTINGS_KEY`
among them, and the mail password in `shared/storage` is only safe in a backup that does not also
hold its key. Keep a copy of `.env.production` somewhere else (a password manager, for example).

```bash
# for example, to another machine; never the whole shared/ folder
rsync -a /opt/custoro/backups /opt/custoro/shared/uploads /opt/custoro/shared/storage backup-host:custoro/
```

To restore a dump (stop the API first; everything written since the dump is lost):

```bash
sudo systemctl stop custoro-api
gzip -dc /opt/custoro/backups/db-<time>.sql.gz | mariadb -h <DB_HOST> -u <DB_USERNAME> -p <DB_NAME>
sudo systemctl start custoro-api
```

A dump of a MariaDB server loads into MariaDB, not MySQL (and the other way round).

## Zone.ee web hosting

Zone.ee web hosting has SSH but no root, systemd or nginx of your own: Zone's web server takes
HTTPS and forwards the whole (sub)domain to one port, and PM2 keeps Node apps running. `custoro.sh`
sees that it runs without root with `pm2` installed and works in its PM2 mode:

```
browser ──https──> Zone's web server ──> Custoro (Node 24, PM2, <loopback IP>:<port>) ──> Zone MariaDB
                                           ├── /api/...  the API
                                           └── the rest  the web app's files, with the nginx headers
```

Everything lives in `~/custoro` (same layout as above), owned by the hosting account.

### Once, in My Zone

1. A (sub)domain for Custoro, for example `arved.example.ee`, with HTTPS (Let's Encrypt) on.
2. **Databases > MySQL/MariaDB**: a database and a user with all rights on it. Note the database
   name, the user, the password and the server address (shown there).
3. **Webhosting > System information**: note the **Loopback IP**. The API must listen on it, not on
   127.0.0.1.
4. Choose a free port between 1024 and 65535 (for example 3999). In **Webhosting > Main domain
   settings** (or **Subdomains**) > **Modify**, set it as the **mod_proxy backend port** of the
   Custoro domain.
5. Your SSH key, if SSH does not work yet.

### Once, over SSH

```bash
# Zone has Node 24 (/usr/bin/node) and PM2 (/opt/zse/bin/pm2) for every account; no nvm.
# Older than 24: Zone's guide "Changing the Node.js version"
node -v && pm2 -v           # v24.x, and a PM2 version

curl -fsSLO https://raw.githubusercontent.com/dooker/custoro/main/deploy/server/custoro.sh
bash custoro.sh deploy latest
```

The first run creates `~/custoro/shared/.env.production` and stops. Fill it in
(`nano ~/custoro/shared/.env.production`) as in the table under 2. Install, plus:

| Setting        | Value                                                                                  |
| -------------- | -------------------------------------------------------------------------------------- |
| `SERVICE_HOST` | the loopback IP from step 3                                                            |
| `SERVICE_PORT` | the backend port from step 4                                                           |
| `TRUST_PROXY`  | `1`: Zone's web server is the one proxy in front                                       |
| `APP_ORIGIN`   | `https://arved.example.ee`                                                             |
| `DB_SSL`       | leave it unset (`verify`); `off` only if the migrations say Zone's database has no TLS |

Run `bash custoro.sh deploy latest` again. It installs the release, loads the schema into the
empty database, runs the migrations and starts Custoro with PM2 from `~/custoro/pm2.json`.

Then, once:

- **My Zone > Webhosting > PM2 and Node.js > Add application**: name `custoro`, script
  `~/custoro/pm2.json` written out in full (`echo ~/custoro/pm2.json` prints it). Zone then starts
  it again after a server restart (it restarts the app once when you save). The panel may offer
  at most 64 MB of memory: take that. PM2 keeps the app's own limit from `pm2.json` (500 MB); the
  API uses about 150 MB, and Zone did not stop it for that.
- The first admin, in your own SSH session (it asks for the password):
  `~/custoro/current/deploy/custoro.sh create-admin you@example.com --name "Your Name"`
- **My Zone > Webhosting > Crontab**, a daily database dump at `0 3 * * *`, maximum execution
  time 15 minutes, the home folder written out in full (`echo ~`):
  `bash /data01/<account>/custoro/current/deploy/custoro.sh backup >/dev/null`. It always runs the
  script of the running release. (Releases before 5.0.1 needed `PATH=/opt/zse/bin:/usr/bin:/bin`
  in front: cron's short `PATH` lacks Zone's tools, and the script then refused to run.)

Every deploy also links `~/bin/custoro` to the running release's script; `~/bin` is on the `PATH`
on Zone, so `custoro status`, `custoro backup` and `custoro deploy latest` work from any folder.

### Updating

```bash
ssh <account>@<server>
custoro deploy latest
```

`latest` is the newest release on GitHub that has a server bundle; a version number (`deploy
5.0.1`) or a bundle file works too. The rest is as under [Updating](#updating): checksum, database
dump, migrations, switch, health check, and back to the previous release if the new one does not
answer. `status`, `rollback` and `backup` work the same; the log is `pm2 logs custoro`.

### What is different from nginx

- The API serves the web app with the same headers as the nginx setup (content security policy,
  caching), from `apps/api/routes/webApp.ts`.
- Zone's web server writes its own access log, which Custoro cannot reach: unlike the nginx setup,
  it keeps password-reset links (`/restore/<token>`) and invoice links (`/pdf/<hash>`) whole. Reset
  links work once and expire; invoice links stay valid, so keep the hosting account's logs private.
