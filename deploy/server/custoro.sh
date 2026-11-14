#!/usr/bin/env bash
# Installs and updates Custoro on a Linux server without Docker (see README.md next to this file).
# It needs Node 24 (node and npm), curl and tar, and the MariaDB (or MySQL) client for the
# database backup and a first install. Two ways to run the API:
#   systemd (as root): a systemd service, nginx in front, in /opt/custoro
#   pm2 (as the hosting account, no root): a PM2 app that serves the web app too, in ~/custoro,
#     for a web host that forwards the domain to one port (Zone.ee); chosen when not run as root
#     and pm2 is installed, or with CUSTORO_RUNNER=pm2
#
#   custoro.sh deploy <latest | version | bundle.tar.gz> [--no-backup]   install or update
#   custoro.sh rollback                    back to the release before the current one
#   custoro.sh status                      which release runs, and does it answer
#   custoro.sh backup                      dump the database into backups/
#   custoro.sh create-admin <email> [--reset] [--name "Full Name"]   the first admin, or back in
#
# Layout (CUSTORO_HOME, default /opt/custoro, or ~/custoro with pm2):
#   releases/<version>/{api,web,db,deploy}   one folder per release, owned by root
#   current -> releases/<version>            what runs; previous -> the one before
#   shared/.env.production                   the settings (secrets), kept across releases
#   shared/uploads, shared/storage           pictures, invoice PDFs, mail settings
#   backups/                                 database dumps taken before each update
#   pm2.json                                 pm2 only: the PM2 app, rewritten by every deploy
#
# An update: unpack, npm ci, dump the database, stop the API, migrate, switch `current`, start,
# check that GET / answers the new version. If it does not, `current` goes back and the old API
# starts again; the dump is the way back for the database (the command is shown).
set -euo pipefail

runner=${CUSTORO_RUNNER:-}
if [ -z "$runner" ]; then
    if [ "$(id -u)" != 0 ] && command -v pm2 >/dev/null; then runner=pm2; else runner=systemd; fi
fi
case "$runner" in
    systemd)
        home=${CUSTORO_HOME:-/opt/custoro}
        service=${CUSTORO_SERVICE:-custoro-api}
        ;;
    pm2)
        home=${CUSTORO_HOME:-$HOME/custoro}
        service=${CUSTORO_SERVICE:-custoro}
        ;;
    *)
        printf 'custoro: CUSTORO_RUNNER is systemd or pm2, not %s\n' "$runner" >&2
        exit 1
        ;;
esac
repo=${CUSTORO_REPO:-dooker/custoro}
run_user=${CUSTORO_USER:-custoro}
keep_releases=3
tmp=""
options=""
trap 'rm -rf "$tmp"; [ -z "$options" ] || rm -f "$options"' EXIT

say() { printf '\033[1m%s\033[0m\n' "$*"; }
fail() { printf 'custoro: %s\n' "$*" >&2; exit 1; }

# systemd needs root; with pm2 everything belongs to the account that runs it
need_root() {
    [ "$runner" = pm2 ] || [ "$(id -u)" = 0 ] || fail "run this as root: sudo $0 $*"
}

# Where the API's log is
log_hint() {
    if [ "$runner" = pm2 ]; then echo "pm2 logs $service --lines 50"; else echo "journalctl -u $service -n 50"; fi
}

need_node() {
    command -v node >/dev/null && command -v npm >/dev/null ||
        fail "Node 24 is not installed (node and npm), see README.md"
    [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 24 ] ||
        fail "Node $(node -v) is too old: Custoro needs Node 24"
}

# One setting of .env.production, read the way the API reads it (dotenv), never run as shell
setting() {
    node -e '
        const values = require(process.argv[1]).parse(require("fs").readFileSync(process.argv[2]));
        process.stdout.write(values[process.argv[3]] ?? "");
    ' "$1/node_modules/dotenv" "$home/shared/.env.production" "$2"
}

api_port() {
    local port
    port=$(setting "$1" SERVICE_PORT)
    echo "${port:-3999}"
}

# The address the API answers on: systemd sets 127.0.0.1; a web host may give the account its own
# loopback address (Zone.ee: SERVICE_HOST in .env.production)
api_url() {
    local host="127.0.0.1"
    if [ "$runner" = pm2 ]; then
        host=$(setting "$1" SERVICE_HOST)
        host=${host:-127.0.0.1}
        # An IPv6 address goes in brackets in a URL (http://[::1]:3999/)
        case "$host" in \[*) ;; *:*) host="[$host]" ;; esac
        # With pm2 the API serves the web app at / and itself under /api (routes/webApp.ts)
        echo "http://$host:$(api_port "$1")/api/"
    else
        echo "http://$host:$(api_port "$1")/"
    fi
}

client() { command -v "$1" 2>/dev/null || command -v "$2" 2>/dev/null || true; }

# A private options file for the database client, so the password never reaches a command line.
# The client gets it as --defaults-file, the one file it reads: with --defaults-extra-file it also
# reads ~/.my.cnf afterwards, and a web host's own (Zone.ee: host, and an empty user and password)
# replaced the login with an empty one ("Access denied for user '<account>'@..., password: NO")
# TLS as the migrations do it: DB_SSL=off plain, anything else verified (see config/dbSsl.js).
write_client_options() {
    local api=$1 program=$2 ssl ca port
    [ -z "$options" ] || rm -f "$options"
    options=$(mktemp)
    chmod 600 "$options"
    ssl=$(setting "$api" DB_SSL)
    ca=$(setting "$api" DB_SSL_CA)
    port=$(setting "$api" DB_PORT)
    {
        echo "[client]"
        echo "host=$(setting "$api" DB_HOST)"
        [ -z "$port" ] || echo "port=$port"
        echo "user=$(setting "$api" DB_USERNAME)"
        printf 'password="%s"\n' "$(setting "$api" DB_PASSWORD | sed 's/\\/\\\\/g; s/"/\\"/g')"
        if "$program" --version 2>/dev/null | grep -qi mariadb; then
            [ "$ssl" = off ] && echo "skip-ssl" || { echo "ssl"; echo "ssl-verify-server-cert"; }
        else
            [ "$ssl" = off ] && echo "ssl-mode=DISABLED" || echo "ssl-mode=VERIFY_IDENTITY"
        fi
        [ -z "$ca" ] || echo "ssl-ca=$ca"
    } >"$options"
}

setup_once() {
    local bundle=$1
    if [ "$runner" = pm2 ]; then
        setup_once_pm2 "$bundle"
        return
    fi
    id "$run_user" >/dev/null 2>&1 ||
        useradd --system --home-dir "$home" --no-create-home --shell /usr/sbin/nologin "$run_user"
    mkdir -p "$home/releases" "$home/backups" "$home/shared/uploads" "$home/shared/storage/pdf"
    chown -R "$run_user:$run_user" "$home/shared/uploads" "$home/shared/storage"
    chmod 700 "$home/backups"

    if [ ! -f "$home/shared/.env.production" ]; then
        cp "$bundle/deploy/env.production.example" "$home/shared/.env.production"
        chown "root:$run_user" "$home/shared/.env.production"
        chmod 640 "$home/shared/.env.production"
        say "Created $home/shared/.env.production"
        echo "Fill it in: the database, APP_ORIGIN (https://your.domain), JWT_SECRET (openssl rand"
        echo "-hex 32), TRUST_PROXY=1 (nginx in front). Then run the same command again."
        exit 2
    fi

    # The systemd unit, with this server's node and paths
    local unit="/etc/systemd/system/$service.service"
    sed -e "s|@NODE@|$(command -v node)|" -e "s|@HOME@|$home|g" -e "s|@USER@|$run_user|g" \
        "$bundle/deploy/custoro-api.service" >"$unit.new"
    if cmp -s "$unit.new" "$unit"; then
        rm -f "$unit.new"
    else
        mv "$unit.new" "$unit"
        systemctl daemon-reload
        systemctl enable "$service" >/dev/null 2>&1 || true
    fi
}

# pm2: the account that runs this owns everything; only it may read the settings and the dumps
setup_once_pm2() {
    local bundle=$1
    mkdir -p "$home/releases" "$home/backups" "$home/shared/uploads" "$home/shared/storage/pdf"
    chmod 700 "$home/backups" "$home/shared/storage"

    if [ ! -f "$home/shared/.env.production" ]; then
        (umask 077 && cp "$bundle/deploy/env.production.example" "$home/shared/.env.production")
        say "Created $home/shared/.env.production"
        echo "Fill it in (README.md, Zone.ee): the database, APP_ORIGIN (https://your.domain),"
        echo "JWT_SECRET and MAIL_SETTINGS_KEY (openssl rand -hex 32), TRUST_PROXY=1, SERVICE_HOST"
        echo "(the loopback IP of the hosting account) and SERVICE_PORT (the domain's backend port)."
        echo "Then run the same command again."
        exit 2
    fi
    chmod 600 "$home/shared/.env.production"
}

# pm2: the app's settings, rewritten by every deploy with the release's build. PM2 reads it when
# the app starts or restarts through it, and a host's control panel can name it (Zone.ee)
write_pm2_config() {
    local release=$1
    node -e '
        const fs = require("fs");
        const [file, home, name, node, buildInfo] = process.argv.slice(1);
        const build = Object.fromEntries(
            fs.readFileSync(buildInfo, "utf8").split("\n").filter((line) => line.includes("="))
                .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)])
        );
        const app = {
            name,
            script: `${home}/current/api/dist/index.js`,
            cwd: `${home}/current/api`,
            interpreter: node,
            // The API finishes running requests for up to 25 s when it is told to stop
            kill_timeout: 30000,
            max_memory_restart: "500M",
            env: { NODE_ENV: "production", WEB_DIR: `${home}/current/web`, ...build }
        };
        fs.writeFileSync(`${file}.new`, JSON.stringify({ apps: [app] }, null, 4) + "\n");
        fs.renameSync(`${file}.new`, file);
    ' "$home/pm2.json" "$home" "$service" "$(command -v node)" "$release/api/build-info.env"
}

# Whether PM2 runs the app now
pm2_known() { pm2 pid "$service" 2>/dev/null | grep -q '^[1-9]'; }

stop_api() {
    if [ "$runner" = pm2 ]; then
        # Nothing to stop on a first install
        pm2 describe "$service" >/dev/null 2>&1 || return 0
        pm2 stop "$service" >/dev/null
    else
        systemctl stop "$service"
    fi
}

# Starts the release `current` points at
restart_api() {
    if [ "$runner" = pm2 ]; then
        write_pm2_config "$(readlink -f "$home/current")" || return 1
        pm2 delete "$service" >/dev/null 2>&1 || true
        pm2 start "$home/pm2.json" >/dev/null || return 1
        pm2 save >/dev/null 2>&1 || true
    else
        systemctl restart "$service"
    fi
}

api_running() {
    if [ "$runner" = pm2 ]; then pm2_known; else systemctl is-active --quiet "$service"; fi
}

check_settings() {
    local api=$1 missing=()
    for key in DB_HOST DB_USERNAME DB_PASSWORD DB_NAME APP_ORIGIN JWT_SECRET TRUST_PROXY; do
        [ -n "$(setting "$api" "$key")" ] || missing+=("$key")
    done
    [ ${#missing[@]} -eq 0 ] || fail "set ${missing[*]} in $home/shared/.env.production"
    # At least 32 characters, the API's own rule (jwtSecretProblem in helpers/startupChecks.ts)
    [ "$(setting "$api" JWT_SECRET | wc -c)" -ge 32 ] ||
        fail "JWT_SECRET has fewer than 32 characters; make one with: openssl rand -hex 32"
}

fetch_bundle() {
    local wanted=$1
    if [ -f "$wanted" ]; then
        cp "$wanted" "$tmp/bundle.tar.gz"
        if [ -f "$wanted.sha256" ]; then
            echo "$(cut -d' ' -f1 "$wanted.sha256")  $tmp/bundle.tar.gz" | sha256sum -c - >/dev/null ||
                fail "$wanted does not match $wanted.sha256"
        fi
        return
    fi
    local version=${wanted#v}
    local base="https://github.com/$repo/releases/download/v$version"
    say "Downloading custoro-$version from github.com/$repo"
    curl -fsSL -o "$tmp/bundle.tar.gz" "$base/custoro-$version.tar.gz" ||
        fail "github.com/$repo/releases has no bundle for $version"
    curl -fsSL -o "$tmp/bundle.sha256" "$base/custoro-$version.tar.gz.sha256" ||
        fail "github.com/$repo/releases has no checksum for $version"
    echo "$(cut -d' ' -f1 "$tmp/bundle.sha256")  $tmp/bundle.tar.gz" | sha256sum -c - >/dev/null ||
        fail "the download does not match its checksum"
}

# A dump of the database; a dump that is empty or cut off is not kept. Its path goes into
# $backup_file: called as $(backup), it would run in a subshell, whose options file (with the
# database password) the EXIT trap of this shell would never see and so never remove
backup_file=""
backup() {
    local api=$1 dump file
    dump=$(client mariadb-dump mysqldump)
    [ -n "$dump" ] || fail "no mariadb-dump: apt install mariadb-client (or skip the backup with --no-backup)"
    write_client_options "$api" "$dump"
    file="$home/backups/db-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
    if ! "$dump" --defaults-file="$options" --single-transaction --no-tablespaces \
        "$(setting "$api" DB_NAME)" | gzip >"$file.partial"; then
        rm -f "$file.partial"
        fail "the database dump failed; nothing was changed"
    fi
    gzip -dc "$file.partial" | tail -n 1 | grep -q 'Dump completed' ||
        { rm -f "$file.partial"; fail "the database dump is incomplete; nothing was changed"; }
    mv "$file.partial" "$file"
    chmod 600 "$file"
    backup_file=$file
}

# Whether the database has the app's tables yet (an existing install, or a new empty database)
database_is_empty() {
    local api=$1 mysql
    mysql=$(client mariadb mysql)
    [ -n "$mysql" ] || fail "no mariadb client: apt install mariadb-client"
    write_client_options "$api" "$mysql"
    local tables
    # A database it cannot reach is not an empty one: stop before loading the schema into it
    tables=$("$mysql" --defaults-file="$options" -N -e "SHOW TABLES LIKE 'config'" "$(setting "$api" DB_NAME)") ||
        fail "cannot read the database $(setting "$api" DB_NAME) on $(setting "$api" DB_HOST) (see the error above); the database and the running app were not changed"
    [ -z "$tables" ]
}

# The schema and the config seed for an empty database, as the Docker setup loads them on its
# first start; the migrations then find nothing to do
load_schema() {
    local api=$1 release=$2 mysql
    mysql=$(client mariadb mysql)
    write_client_options "$api" "$mysql"
    say "The database is empty: loading the schema and the settings"
    cat "$release/db/01-schema.sql" "$release/db/02-seed.sql" |
        "$mysql" --defaults-file="$options" "$(setting "$api" DB_NAME)"
}

healthy() {
    local url=$1 version=$2
    for _ in $(seq 1 30); do
        curl -gfsS "$url" 2>/dev/null | grep -q "\"version\":\"$version\"" && return 0
        sleep 1
    done
    return 1
}

point() {
    ln -sfn "$2" "$home/$1.new"
    mv -T "$home/$1.new" "$home/$1"
}

# The new release in place and running: each step is checked here, because a function called
# in an `if` runs without `set -e`
switch_to_release() {
    local release=$1 version=$2 url
    (cd "$release/api" && npm prune --omit=dev --omit=optional --no-audit --no-fund --loglevel=error) ||
        return 1
    if [ "$runner" = systemd ]; then chown -R root:root "$release" || return 1; fi
    chmod -R go-w "$release" || return 1
    point current "$release" || return 1
    restart_api || return 1
    url=$(api_url "$release/api") || return 1
    healthy "$url" "$version" || {
        echo "$version does not answer at $url; its log: $(log_hint)" >&2
        return 1
    }
}

# After a failed update: the previous release runs again (if there is one), and says so
back_to() {
    local current=$1 dump=$2 reason=$3
    echo "custoro: $reason." >&2
    if [ -z "$current" ]; then
        echo "Nothing runs yet; fix the cause and run the same command again." >&2
        return
    fi
    point current "$current" || true
    restart_api || true
    if healthy "$(api_url "$current/api")" "$(cat "$current/VERSION")"; then
        echo "Back on $(cat "$current/VERSION"), which answers again." >&2
    else
        echo "$(cat "$current/VERSION") does not answer either: $(log_hint)" >&2
    fi
    [ -z "$dump" ] || echo "If the database was migrated and the old release misbehaves, restore $dump (README.md)." >&2
}

# The newest release on GitHub that has a server bundle, pre-releases included
latest_version() {
    node -e '
        const repo = process.argv[1];
        fetch(`https://api.github.com/repos/${repo}/releases?per_page=20`, {
            headers: { Accept: "application/vnd.github+json", "User-Agent": "custoro-deploy" }
        })
            .then((answer) => {
                if (!answer.ok) throw new Error(`GitHub answered ${answer.status}`);
                return answer.json();
            })
            .then((releases) => {
                const found = releases.find(
                    (release) =>
                        !release.draft &&
                        release.assets.some((asset) => /^custoro-.+\.tar\.gz$/.test(asset.name))
                );
                if (!found) throw new Error("no release has a server bundle yet");
                process.stdout.write(found.tag_name.replace(/^v/, ""));
            })
            .catch((error) => {
                console.error(`custoro: latest: ${error.message}`);
                process.exit(1);
            });
    ' "$repo" || exit 1
}

deploy() {
    local wanted=${1:-} skip_backup=false
    [ -n "$wanted" ] || fail "which version? custoro.sh deploy 5.0.0 (or a bundle file)"
    shift
    for flag in "$@"; do
        case "$flag" in
            --no-backup) skip_backup=true ;;
            *) fail "unknown option $flag" ;;
        esac
    done
    need_root deploy "$wanted"
    need_node
    if [ "$runner" = systemd ]; then
        command -v systemctl >/dev/null || fail "systemd is needed to run the API (systemctl)"
    fi
    if [ "$wanted" = latest ]; then
        wanted=$(latest_version) || exit 1
        say "The latest release with a server bundle is $wanted"
    fi

    tmp=$(mktemp -d)
    fetch_bundle "$wanted"
    tar -xzf "$tmp/bundle.tar.gz" -C "$tmp" --no-same-owner
    local bundle version
    bundle=$(find "$tmp" -mindepth 1 -maxdepth 1 -type d -name 'custoro-*' | head -n 1)
    [ -n "$bundle" ] && [ -f "$bundle/VERSION" ] || fail "this is not a Custoro bundle"
    version=$(cat "$bundle/VERSION")

    local release="$home/releases/$version" current=""
    [ -L "$home/current" ] && current=$(readlink -f "$home/current")
    if [ "$current" = "$release" ]; then
        say "$version runs already; nothing to do"
        return 0
    fi

    setup_once "$bundle"

    say "Installing $version"
    rm -rf "$release"
    mv "$bundle" "$release"
    local api="$release/api"
    # The bundle's nginx site and snippets name /opt/custoro; another CUSTORO_HOME gets its own
    if [ "$home" != /opt/custoro ]; then
        sed -i "s|/opt/custoro/current/|$home/current/|g" "$release"/deploy/nginx/*.conf
    fi
    ln -sfn "$home/shared/.env.production" "$api/.env.production"
    ln -sfn "$home/shared/uploads" "$api/uploads"
    ln -sfn "$home/shared/storage" "$api/storage"

    # Everything, the migration tool included; what only builds and migrations need goes later
    (cd "$api" && npm ci --no-audit --no-fund --loglevel=error)
    check_settings "$api"

    # An existing database is dumped first, also on the first install here: it may come from an
    # older install and get every migration now
    local dump=""
    if database_is_empty "$api"; then
        load_schema "$api" "$release"
    elif [ "$skip_backup" = false ]; then
        say "Backing up the database"
        backup "$api"
        dump=$backup_file
        echo "$dump"
    fi

    # The migrations only run on a stopped API: the old one must not write while the schema
    # changes. From here on every failure goes back to the previous release
    say "Stopping the API and migrating the database"
    if ! stop_api; then
        back_to "$current" "" "the API did not stop, so nothing was migrated"
        exit 1
    fi
    if ! (cd "$api" && NODE_ENV=production node scripts/migrate.js up); then
        back_to "$current" "$dump" "the migration stopped"
        exit 1
    fi
    if ! switch_to_release "$release" "$version"; then
        back_to "$current" "$dump" "$version did not start"
        exit 1
    fi
    [ -z "$current" ] || point previous "$current"

    # Keep the newest few releases, and always the current and the previous one
    local keep
    keep=$(readlink -f "$home/previous" 2>/dev/null || true)
    ls -1dt "$home"/releases/*/ | tail -n +$((keep_releases + 1)) | while read -r old; do
        old=${old%/}
        [ "$old" = "$release" ] || [ "$old" = "$keep" ] || rm -rf "$old"
    done

    say "Custoro $version runs"
    curl -gfsS "$(api_url "$api")"
    echo
    if [ "$runner" = pm2 ]; then
        echo
        echo "PM2 runs it from $home/pm2.json. For a host whose control panel starts the PM2 apps"
        echo "(Zone.ee: Webhosting > PM2 and Node.js), name that file there once, so it starts again"
        echo "after a server restart; the domain's backend port is SERVICE_PORT ($(api_port "$api"))."
    elif command -v nginx >/dev/null && ! grep -rqs "$home/current/web" /etc/nginx/; then
        echo
        echo "nginx does not serve Custoro yet. Add the site (README.md has the TLS step):"
        echo "  cp $home/current/deploy/nginx/custoro-site.conf /etc/nginx/sites-available/custoro"
        echo "  ln -s ../sites-available/custoro /etc/nginx/sites-enabled/custoro"
        echo "  nginx -t && systemctl reload nginx"
    fi
}

rollback() {
    need_root rollback
    [ -L "$home/previous" ] || fail "there is no previous release to go back to"
    local previous current version
    previous=$(readlink -f "$home/previous")
    current=$(readlink -f "$home/current")
    [ -d "$previous" ] || fail "the previous release $previous is gone"
    version=$(cat "$previous/VERSION")
    point current "$previous"
    point previous "$current"
    restart_api
    healthy "$(api_url "$previous/api")" "$version" ||
        fail "$version does not answer: $(log_hint)"
    say "Back on $version"
    echo "If $(cat "$current/VERSION") had migrations (its changelog says so), restore the dump taken"
    echo "before it as well: ls -t $home/backups (README.md, Restore)"
}

status() {
    [ -L "$home/current" ] || fail "Custoro is not installed in $home"
    local current
    current=$(readlink -f "$home/current")
    echo "current:  $(cat "$current/VERSION")  ($current)"
    [ ! -L "$home/previous" ] || echo "previous: $(cat "$(readlink -f "$home/previous")/VERSION")"
    if api_running; then echo "service:  running ($runner)"; else echo "service:  stopped ($runner)"; fi
    local url answer=""
    url=$(api_url "$current/api")
    for _ in 1 2 3 4 5; do
        answer=$(curl -gfsS "$url" 2>/dev/null) && break
        sleep 1
    done
    echo "api:      ${answer:-does not answer at $url}"
}

create_admin() {
    need_root create-admin
    [ -L "$home/current" ] || fail "install Custoro first"
    cd "$home/current/api"
    if [ "$runner" = pm2 ]; then
        NODE_ENV=production node dist/scripts/createAdmin.js "$@"
    else
        runuser -u "$run_user" -- env NODE_ENV=production node dist/scripts/createAdmin.js "$@"
    fi
}

# Sourced (the tests in scripts/deploy-server.test.mjs), it only defines the functions
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    command=${1:-}
    [ $# -eq 0 ] || shift
    case "$command" in
        deploy) deploy "$@" ;;
        rollback) rollback ;;
        status) status ;;
        backup)
            need_root backup
            [ -L "$home/current" ] || fail "install Custoro first"
            backup "$home/current/api"
            echo "$backup_file"
            ;;
        create-admin) create_admin "$@" ;;
        *)
            # The header up to its Layout part: what the script does and its commands
            sed -n '2,/^# Layout/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
            exit 1
            ;;
    esac
fi
