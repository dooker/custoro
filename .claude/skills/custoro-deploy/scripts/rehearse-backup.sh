#!/usr/bin/env bash
# Rehearses apps/api/scripts/backup.sh and restore.sh on real databases, on throwaway copies of the
# production stack (docker-compose.prod.yml), and compares before and after.
#
#   rehearse-backup.sh [image ...]      default: mysql:8.4 mariadb:11.4
#
#   PROJECT=<name>   prefix of the private compose projects (default custoro-backup; never "custoro",
#                    whose dev database `down -v` would delete)
#   INVOICES=<n>     invoices to generate (default 50000: 2000 customers, 500 products, 250000 lines,
#                    100000 worksheets, scripts/gen-volume.sql of the custoro-db-migration skill)
#   KEEP=1           leave the stacks and the API image, their names are printed
#
# For every image there is a source stack, filled with the generated data, a few awkward rows (emoji,
# quotes, backslashes, a user with a password hash) and awkward files (spaces, umlauts, a dotfile, an
# empty file, a megabyte of noise), and a target stack, new and empty like a server about to be
# rebuilt. Every source is backed up and every backup is offered to every target. A backup restores
# into the same kind of server only (MySQL into MySQL, MariaDB into MariaDB): the generated column
# invoices.number_sort is dumped in a form the other server refuses, MariaDB's dump has its value in
# every INSERT (MySQL error 3105) and MySQL's has the expression as regexp_like() (MariaDB error
# 1901). So across the two kinds restore.sh must refuse before it changes anything, and the target
# must be as it was. After each restore, against what the source had before the backup:
#   rows, content and money: per table the row count, a checksum over every row's text, the sum of
#                  every DECIMAL column, and the invoice totals (line total, discounted total, gross)
#   structure:     per table columns, indexes and foreign keys (counts, equal on both engines)
#   files:         every file's path, type, size, mode, owner and sha256 in both volumes
#   app user:      the database user the API logs in as can read the restored invoices
# Then, on the same engine, the same again with writers busy during the dump: a backup taken while
# one transaction after the other inserts a customer and a product together must hold both or
# neither, the proof the snapshot is consistent (the counts are compared, and must be neither 0 nor
# all). And the API image starts on the restored database.
#
# Nothing touches the default compose project, a published port or a real database. The API image is
# built under the private tag $PROJECT-api:latest (the prod compose names it custoro-api:latest, the
# name the dev stack uses too). Needs Docker and about 2 GB of disk; about 3 minutes with the images cached. Exit 1 when
# anything differs or a command fails.

set -euo pipefail

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
fi

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
prod="$repo/docker-compose.prod.yml"
backup_sh="$repo/apps/api/scripts/backup.sh"
restore_sh="$repo/apps/api/scripts/restore.sh"
volume_sql="$repo/.claude/skills/custoro-db-migration/scripts/gen-volume.sql"
project=${PROJECT:-custoro-backup}
invoices=${INVOICES:-50000}
engines=("$@")
[ ${#engines[@]} -gt 0 ] || engines=(mysql:8.4 mariadb:11.4)

[ "$project" != custoro ] || { echo "PROJECT=custoro is the default project: pick another name" >&2; exit 2; }
for f in "$prod" "$backup_sh" "$restore_sh" "$volume_sql"; do
    [ -f "$f" ] || { echo "missing $f" >&2; exit 2; }
done
docker info >/dev/null 2>&1 || { echo "Docker is not running" >&2; exit 2; }

umask 077
work=$(mktemp -d)
failed=0
started=()   # "project|override file", for the cleanup

# Throwaway secrets for the private stacks; they are never printed
cat >"$work/env" <<EOF
DB_ROOT_PASSWORD=$(openssl rand -hex 16)
DB_USERNAME=custoro
DB_PASSWORD=$(openssl rand -hex 16)
APP_ORIGIN=http://localhost
JWT_SECRET=$(openssl rand -hex 32)
TRUST_PROXY=1
API_IMAGE=$project-api:latest
WEB_IMAGE=$project-web:latest
EOF

dc() { # project override-file args...
    local p=$1 o=$2
    shift 2
    docker compose -p "$p" --env-file "$work/env" -f "$prod" -f "$o" "$@"
}

cleanup() {
    local entry
    if [ -n "${KEEP:-}" ]; then
        echo "Kept: ${started[*]:-nothing} (docker compose -p <project> down -v removes one)"
    else
        for entry in ${started[@]+"${started[@]}"}; do
            dc "${entry%%|*}" "${entry#*|}" down -v --remove-orphans >/dev/null 2>&1 || true
        done
        docker rmi "$project-api:latest" >/dev/null 2>&1 || true
    fi
    rm -rf "$work"
}
trap cleanup EXIT

# The compose file's healthcheck calls mysqladmin, which the MariaDB 11.4 image does not have
override_for() { # image -> file
    local file="$work/override-$(printf '%s' "$1" | tr -c 'a-zA-Z0-9' '-').yml"
    {
        echo "services:"
        echo "    db:"
        echo "        image: $1"
        case $1 in
            mariadb*)
                echo "        healthcheck:"
                echo '            test: ["CMD-SHELL", "healthcheck.sh --connect --innodb_initialized"]'
                ;;
        esac
    } >"$file"
    echo "$file"
}

# SQL as root over TCP. A TCP connection only works once the image's real server is up: while it
# initialises (runs db/*.sql) a temporary server listens on the socket only.
sql() { # project override statement
    dc "$1" "$2" exec -T db sh -c 'client=$(command -v mariadb || command -v mysql); export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; exec "$client" -uroot -h127.0.0.1 -N -B "$MYSQL_DATABASE" -e "$1"' sh "$3" </dev/null
}
sql_file() { # project override file
    dc "$1" "$2" exec -T db sh -c 'client=$(command -v mariadb || command -v mysql); export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; exec "$client" -uroot -h127.0.0.1 --default-character-set=utf8mb4 "$MYSQL_DATABASE"' <"$3"
}

start_stack() { # project override
    local i
    started+=("$1|$2")
    dc "$1" "$2" up -d --wait db >"$work/up.log" 2>&1 || { cat "$work/up.log" >&2; return 1; }
    for i in $(seq 1 60); do
        if sql "$1" "$2" "SELECT COUNT(*) FROM config" >/dev/null 2>&1; then return 0; fi
        sleep 2
    done
    echo "the database of $1 did not come up" >&2
    return 1
}

# What a restored database must have kept, one line per fact, the same on MySQL and MariaDB
db_fingerprint() { # project override
    dc "$1" "$2" exec -T db sh -s <<'SCRIPT' | LC_ALL=C sort
client=$(command -v mariadb || command -v mysql)
export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
q() { "$client" -uroot -h127.0.0.1 -N -B "$MYSQL_DATABASE" -e "$1"; }
for t in $(q "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY 1"); do
    cols=$(q "SELECT GROUP_CONCAT(CONCAT('\`', COLUMN_NAME, '\`') ORDER BY ORDINAL_POSITION) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '$t' AND EXTRA NOT LIKE '%GENERATED%'")
    dec=$(q "SELECT GROUP_CONCAT(CONCAT('SUM(\`', COLUMN_NAME, '\`)') ORDER BY ORDINAL_POSITION) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '$t' AND DATA_TYPE = 'decimal'")
    sel="COUNT(*), SUM(CRC32(CONCAT_WS('|', $cols)))"
    if [ -n "$dec" ]; then sel="$sel, $dec"; fi
    printf 'data\t%s\t%s\n' "$t" "$(q "SELECT $sel FROM \`$t\`")"
    printf 'structure\t%s\t%s\n' "$t" "$(q "SELECT
        (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '$t'),
        (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '$t'),
        (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '$t' AND CONSTRAINT_TYPE = 'FOREIGN KEY')")"
done
printf 'money\tinvoice lines\t%s\n' "$(q "SELECT ROUND(SUM(quantity * price), 4), ROUND(SUM(quantity * discount_price), 4) FROM invoice_items")"
printf 'money\tinvoices gross\t%s\n' "$(q "SELECT ROUND(SUM(t.net * (1 + i.vat / 100)), 2) FROM invoices i JOIN (SELECT invoice_id, SUM(quantity * price) AS net FROM invoice_items GROUP BY invoice_id) t ON t.invoice_id = i.id")"
SCRIPT
}

# Every file in both volumes: path, type, size, mode, owner and sha256
files_fingerprint() { # project override
    dc "$1" "$2" run --rm --no-deps -T --user root --entrypoint sh api -c 'cd /app && find uploads storage -printf "%p %y %s %m %U:%G\n" | LC_ALL=C sort; find uploads storage -type f -exec sha256sum {} + | LC_ALL=C sort -k2' </dev/null 2>"$work/files.err" ||
        { cat "$work/files.err" >&2; return 1; }
}

app_user_invoices() { # the API logs in as MYSQL_USER, not as root
    dc "$1" "$2" exec -T db sh -c 'client=$(command -v mariadb || command -v mysql); MYSQL_PWD="$MYSQL_PASSWORD" exec "$client" -u"$MYSQL_USER" -h127.0.0.1 -N -B "$MYSQL_DATABASE" -e "SELECT COUNT(*) FROM invoices"' </dev/null
}

check() { # label expected actual: prints one line, sets failed
    if [ "$2" = "$3" ]; then
        printf '    %-34s ok\n' "$1"
    else
        printf '    %-34s DIFFERENT\n' "$1"
        diff <(printf '%s\n' "$2") <(printf '%s\n' "$3") | sed 's/^/        /' | head -20
        failed=1
    fi
}

awkward_rows=$(cat <<'SQL'
SET NAMES utf8mb4;
INSERT INTO customers (name, contact, address, additional_info) VALUES
  ('Müller & Söhne OÜ — Tallinn 日本語 😀', 'O''Brien', 'back\\slash "double" ''single''', 'line one\nline two\ttab');
INSERT INTO products (code, name, price, discount_price, unit, comment) VALUES
  ('ÄÖÜ-€-1', 'Tööaeg, 1 h ≈ 60 min', 12345678.1234, 0.0001, 'hour', '');
INSERT INTO users (username, password, name, role, forgot_token, forgot_token_expires, token_version) VALUES
  ('rehearsal@example.com', '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234', 'Rehearsal Admin', 'admin', 'hash-of-a-token', '2026-11-04 10:00:00', 7);
SQL
)

awkward_files='cd /app/uploads && echo logo > logo.png && mkdir -p sub/dir && echo "ä ö ü õ" > "sub/dir/ünï cöde name.txt" && : > empty.bin && echo hidden > .hidden && head -c 1048576 /dev/urandom > big.bin && chown -R 1000:1000 . && cd /app/storage && mkdir -p pdf && echo pdf-bytes > pdf/inv-1.pdf && echo "second" > "pdf/inv 2 ü.pdf" && chown -R 1000:1000 .'

echo "Building the API image $project-api:latest (it is how the volumes are read) ..."
dc "$project" "$(override_for "${engines[0]}")" build api >"$work/build.log" 2>&1 || { tail -20 "$work/build.log" >&2; exit 1; }

srcs=()   # "tag|image|project|override"
for image in "${engines[@]}"; do
    tag=$(printf '%s' "$image" | tr -c 'a-zA-Z0-9' '-')
    override=$(override_for "$image")
    p="$project-src-$tag"
    echo
    echo "Source $image ($p)"
    start_stack "$p" "$override"
    echo "  loading $invoices invoices and the awkward rows and files ..."
    (echo "SET @vol_invoices = $invoices;"; cat "$volume_sql") >"$work/volume.sql"
    sql_file "$p" "$override" "$work/volume.sql" >/dev/null
    printf '%s\n' "$awkward_rows" >"$work/awkward.sql"
    sql_file "$p" "$override" "$work/awkward.sql" >/dev/null
    dc "$p" "$override" run --rm --no-deps -T --user root --entrypoint sh api -c "$awkward_files" </dev/null >/dev/null 2>"$work/files.err" || { cat "$work/files.err" >&2; exit 1; }
    db_fingerprint "$p" "$override" >"$work/fp-$tag.txt"
    files_fingerprint "$p" "$override" >"$work/files-$tag.txt"
    app_user_invoices "$p" "$override" >"$work/app-$tag.txt"
    printf '  %s invoices, %s tables, %s files\n' "$(cat "$work/app-$tag.txt")" "$(grep -c '^data' "$work/fp-$tag.txt")" "$(grep -c ' f ' "$work/files-$tag.txt")"

    echo "  backup.sh (quiet database) ..."
    "$backup_sh" --dir "$work/quiet-$tag" --project "$p" --env-file "$work/env" -f "$prod" -f "$override" >"$work/backup.log" 2>&1 ||
        { cat "$work/backup.log" >&2; exit 1; }
    sed -n '/^Backup written/,/^Copy/p' "$work/backup.log" | grep -E '^  ' | sed 's/^/    /'

    echo "  backup.sh while writers are busy ..."
    # one transaction after the other: a customer and a product together, 600 times, in the background
    dc "$p" "$override" exec -d db sh -c 'client=$(command -v mariadb || command -v mysql); export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; i=0; while [ $i -lt "$1" ]; do i=$((i+1)); "$client" -uroot -h127.0.0.1 "$MYSQL_DATABASE" -e "START TRANSACTION; INSERT INTO customers (name) VALUES (\"pair-$i\"); INSERT INTO products (code, name, price, discount_price) VALUES (\"pair-$i\", \"pair\", 1, 1); COMMIT" || exit 1; done; echo done > /tmp/writer.done' sh 600
    for _ in $(seq 1 60); do
        [ "$(sql "$p" "$override" "SELECT COUNT(*) FROM customers WHERE name LIKE 'pair-%'")" -ge 40 ] && break
        sleep 0.5
    done
    "$backup_sh" --dir "$work/live-$tag" --project "$p" --env-file "$work/env" -f "$prod" -f "$override" >"$work/backup.log" 2>&1 ||
        { cat "$work/backup.log" >&2; exit 1; }
    for _ in $(seq 1 120); do
        dc "$p" "$override" exec -T db test -f /tmp/writer.done </dev/null 2>/dev/null && break
        sleep 1
    done
    pairs_total=$(sql "$p" "$override" "SELECT COUNT(*) FROM products WHERE code LIKE 'pair-%'")
    echo "    writers inserted $pairs_total pairs in all"
    echo "$pairs_total" >"$work/pairs-$tag.txt"
    srcs+=("$tag|$image|$p|$override")
done

for target in "${srcs[@]}"; do
    IFS='|' read -r ttag timage _ toverride <<<"$target"
    tp="$project-dst-$ttag"
    echo
    echo "Target $timage ($tp), a new server"
    start_stack "$tp" "$toverride"
    for source in "${srcs[@]}"; do
        IFS='|' read -r stag simage _ _ <<<"$source"
        # A dump with a generated column (invoices.number_sort) loads only into the kind of server
        # that made it, so restore.sh must say so before it drops anything
        case $simage:$timage in
            mariadb*:mariadb*) ;;
            mariadb*:* | *:mariadb*)
                echo "  restore.sh of the $simage backup, which this server cannot load, so it must refuse:"
                before=$(db_fingerprint "$tp" "$toverride")
                if "$restore_sh" "$work"/quiet-"$stag"/custoro-* --yes --project "$tp" --env-file "$work/env" -f "$prod" -f "$toverride" >"$work/restore.log" 2>&1; then
                    printf '    %-34s FAILED (it restored)\n' "refuses"
                    failed=1
                elif grep -q 'cannot load' "$work/restore.log"; then
                    printf '    %-34s ok\n' "refuses, with the reason"
                else
                    printf '    %-34s FAILED (stopped for another reason)\n' "refuses"
                    tail -5 "$work/restore.log" | sed 's/^/        /'
                    failed=1
                fi
                check "target database untouched" "$before" "$(db_fingerprint "$tp" "$toverride")"
                continue
                ;;
        esac
        echo "  restore.sh of the $simage backup:"
        "$restore_sh" "$work"/quiet-"$stag"/custoro-* --yes --project "$tp" --env-file "$work/env" -f "$prod" -f "$toverride" >"$work/restore.log" 2>&1 ||
            { cat "$work/restore.log" >&2; exit 1; }
        db_fingerprint "$tp" "$toverride" >"$work/fp-after.txt"
        check "rows, content and money" "$(grep -E '^(data|money)' "$work/fp-$stag.txt")" "$(grep -E '^(data|money)' "$work/fp-after.txt")"
        check "structure (columns, indexes, keys)" "$(grep '^structure' "$work/fp-$stag.txt")" "$(grep '^structure' "$work/fp-after.txt")"
        files_fingerprint "$tp" "$toverride" >"$work/files-after.txt"
        check "files and owners" "$(cat "$work/files-$stag.txt")" "$(cat "$work/files-after.txt")"
        check "app user reads the invoices" "$(cat "$work/app-$stag.txt")" "$(app_user_invoices "$tp" "$toverride")"
    done
    # The backup taken while the writers ran, from this engine's own source
    echo "  restore.sh of the backup taken during writes ($timage):"
    "$restore_sh" "$work"/live-"$ttag"/custoro-* --yes --project "$tp" --env-file "$work/env" -f "$prod" -f "$toverride" >"$work/restore.log" 2>&1 ||
        { cat "$work/restore.log" >&2; exit 1; }
    read -r customers products <<<"$(sql "$tp" "$toverride" "SELECT (SELECT COUNT(*) FROM customers WHERE name LIKE 'pair-%'), (SELECT COUNT(*) FROM products WHERE code LIKE 'pair-%')")"
    total=$(cat "$work/pairs-$ttag.txt")
    check "customer and product pairs match" "$customers" "$products"
    if [ "$customers" -gt 0 ] && [ "$customers" -lt "$total" ]; then
        printf '    %-34s ok (%s of %s pairs were in when the dump ran)\n' "dump ran during the writes" "$customers" "$total"
    else
        printf '    %-34s INCONCLUSIVE (%s of %s pairs): the writers were not busy during the dump\n' "dump ran during the writes" "$customers" "$total"
        failed=1
    fi
    echo "  the API image starts on the restored database:"
    if dc "$tp" "$toverride" up -d --wait api >"$work/up.log" 2>&1; then
        printf '    %-34s ok\n' "api healthy"
    else
        printf '    %-34s FAILED\n' "api healthy"
        tail -5 "$work/up.log" | sed 's/^/        /'
        failed=1
    fi
done

echo
if [ "$failed" = 0 ]; then
    echo "Rehearsal passed: every backup restored with the same rows, money, structure and files."
else
    echo "Rehearsal FAILED, see DIFFERENT and INCONCLUSIVE above."
    exit 1
fi
