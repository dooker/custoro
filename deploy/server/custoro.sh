#!/usr/bin/env bash
# Installs and updates Custoro on a Linux server without Docker (see README.md next to this file).
# Run as root. It needs Node 24 (node and npm), systemd, curl and tar, nginx in front, and the
# MariaDB (or MySQL) client for the database backup and a first install.
#
#   custoro.sh deploy <version | bundle.tar.gz> [--no-backup]   install or update: deploy 5.0.0
#   custoro.sh rollback                    back to the release before the current one
#   custoro.sh status                      which release runs, and does it answer
#   custoro.sh backup                      dump the database into /opt/custoro/backups
#   custoro.sh create-admin <email> [--reset] [--name "Full Name"]   the first admin, or back in
#
# Layout (CUSTORO_HOME, default /opt/custoro):
#   releases/<version>/{api,web,db,deploy}   one folder per release, owned by root
#   current -> releases/<version>            what runs; previous -> the one before
#   shared/.env.production                   the settings (secrets), kept across releases
#   shared/uploads, shared/storage           pictures, invoice PDFs, mail settings
#   backups/                                 database dumps taken before each update
#
# An update: unpack, npm ci, dump the database, stop the API, migrate, switch `current`, start,
# check that GET / answers the new version. If it does not, `current` goes back and the old API
# starts again; the dump is the way back for the database (the command is shown).
set -euo pipefail

home=${CUSTORO_HOME:-/opt/custoro}
repo=${CUSTORO_REPO:-dooker/custoro}
service=${CUSTORO_SERVICE:-custoro-api}
run_user=${CUSTORO_USER:-custoro}
keep_releases=3
tmp=""
options=""
trap 'rm -rf "$tmp"; [ -z "$options" ] || rm -f "$options"' EXIT

say() { printf '\033[1m%s\033[0m\n' "$*"; }
fail() { printf 'custoro: %s\n' "$*" >&2; exit 1; }

need_root() { [ "$(id -u)" = 0 ] || fail "run this as root: sudo $0 $*"; }

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

client() { command -v "$1" 2>/dev/null || command -v "$2" 2>/dev/null || true; }

# A private options file for the database client, so the password never reaches a command line.
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

check_settings() {
    local api=$1 missing=()
    for key in DB_HOST DB_USERNAME DB_PASSWORD DB_NAME APP_ORIGIN JWT_SECRET TRUST_PROXY; do
        [ -n "$(setting "$api" "$key")" ] || missing+=("$key")
    done
    [ ${#missing[@]} -eq 0 ] || fail "set ${missing[*]} in $home/shared/.env.production"
    [ "$(setting "$api" JWT_SECRET | wc -c)" -gt 32 ] ||
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

# A dump of the database; a dump that is empty or cut off is not kept
backup() {
    local api=$1 dump file
    dump=$(client mariadb-dump mysqldump)
    [ -n "$dump" ] || fail "no mariadb-dump: apt install mariadb-client (or skip the backup with --no-backup)"
    write_client_options "$api" "$dump"
    file="$home/backups/db-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
    if ! "$dump" --defaults-extra-file="$options" --single-transaction --no-tablespaces \
        "$(setting "$api" DB_NAME)" | gzip >"$file.partial"; then
        rm -f "$file.partial"
        fail "the database dump failed; nothing was changed"
    fi
    gzip -dc "$file.partial" | tail -n 1 | grep -q 'Dump completed' ||
        { rm -f "$file.partial"; fail "the database dump is incomplete; nothing was changed"; }
    mv "$file.partial" "$file"
    chmod 600 "$file"
    echo "$file"
}

# Whether the database has the app's tables yet (an existing install, or a new empty database)
database_is_empty() {
    local api=$1 mysql
    mysql=$(client mariadb mysql)
    [ -n "$mysql" ] || fail "no mariadb client: apt install mariadb-client"
    write_client_options "$api" "$mysql"
    [ -z "$("$mysql" --defaults-extra-file="$options" -N -e "SHOW TABLES LIKE 'config'" "$(setting "$api" DB_NAME)")" ]
}

# The schema and the config seed for an empty database, as the Docker setup loads them on its
# first start; the migrations then find nothing to do
load_schema() {
    local api=$1 release=$2 mysql
    mysql=$(client mariadb mysql)
    write_client_options "$api" "$mysql"
    say "The database is empty: loading the schema and the settings"
    cat "$release/db/01-schema.sql" "$release/db/02-seed.sql" |
        "$mysql" --defaults-extra-file="$options" "$(setting "$api" DB_NAME)"
}

healthy() {
    local port=$1 version=$2
    for _ in $(seq 1 30); do
        curl -fsS "http://127.0.0.1:$port/" 2>/dev/null | grep -q "\"version\":\"$version\"" && return 0
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
    local release=$1 version=$2 port
    (cd "$release/api" && npm prune --omit=dev --omit=optional --no-audit --no-fund --loglevel=error) ||
        return 1
    chown -R root:root "$release" && chmod -R go-w "$release" || return 1
    point current "$release" || return 1
    systemctl restart "$service" || return 1
    port=$(api_port "$release/api") || return 1
    healthy "$port" "$version" || {
        echo "$version does not answer on port $port; its log: journalctl -u $service -n 50" >&2
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
    systemctl restart "$service" || true
    if healthy "$(api_port "$current/api")" "$(cat "$current/VERSION")"; then
        echo "Back on $(cat "$current/VERSION"), which answers again." >&2
    else
        echo "$(cat "$current/VERSION") does not answer either: journalctl -u $service -n 50" >&2
    fi
    [ -z "$dump" ] || echo "If the database was migrated and the old release misbehaves, restore $dump (README.md)." >&2
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
    command -v systemctl >/dev/null || fail "systemd is needed to run the API (systemctl)"

    tmp=$(mktemp -d)
    fetch_bundle "$wanted"
    tar -xzf "$tmp/bundle.tar.gz" -C "$tmp" --no-same-owner
    local bundle version
    bundle=$(find "$tmp" -mindepth 1 -maxdepth 1 -type d -name 'custoro-*' | head -n 1)
    [ -n "$bundle" ] && [ -f "$bundle/VERSION" ] || fail "this is not a Custoro bundle"
    version=$(cat "$bundle/VERSION")

    local release="$home/releases/$version" current=""
    [ -L "$home/current" ] && current=$(readlink -f "$home/current")
    [ "$current" != "$release" ] || fail "$version is the release that runs now"

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
        dump=$(backup "$api")
        echo "$dump"
    fi

    # From here on the API is stopped: every failure goes back to the previous release
    say "Stopping the API and migrating the database"
    systemctl stop "$service" 2>/dev/null || true
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
    curl -fsS "http://127.0.0.1:$(api_port "$api")/"
    echo
    if command -v nginx >/dev/null && ! grep -rqs "$home/current/web" /etc/nginx/; then
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
    systemctl restart "$service"
    healthy "$(api_port "$previous/api")" "$version" ||
        fail "$version does not answer: journalctl -u $service -n 50"
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
    if systemctl is-active --quiet "$service"; then echo "service:  running"; else echo "service:  stopped"; fi
    local port answer=""
    port=$(api_port "$current/api")
    for _ in 1 2 3 4 5; do
        answer=$(curl -fsS "http://127.0.0.1:$port/" 2>/dev/null) && break
        sleep 1
    done
    echo "api:      ${answer:-does not answer on port $port}"
}

create_admin() {
    need_root create-admin
    [ -L "$home/current" ] || fail "install Custoro first"
    cd "$home/current/api"
    runuser -u "$run_user" -- env NODE_ENV=production node dist/scripts/createAdmin.js "$@"
}

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
        ;;
    create-admin) create_admin "$@" ;;
    *)
        sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
        exit 1
        ;;
esac
