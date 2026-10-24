#!/usr/bin/env bash
# Schema drift check: does a database upgraded by the migrations end up with the same structure as a
# fresh install of apps/api/db/01-schema.sql? Runs on throwaway MySQL and MariaDB containers.
#
#   schema-drift.sh [image ...]       default: mysql:8.4 mariadb:11.4
#
#   PREVIOUS=<git ref>   the "before" schema: db/01-schema.sql at this ref
#                        (default: the merge base of HEAD and origin/main, or main)
#   SEED_SQL=<file>      SQL loaded into the "before" database first, so the migrations run on data
#                        (e.g. scripts/gen-volume.sql); row counts must not change
#   KEEP=1               leave the containers running, their names are printed
#
# Checks, per engine:
#   1. fresh 01-schema.sql  ==  PREVIOUS schema + every migration
#   2. migrations on the fresh install change nothing
#   3. migrations a second time (migrations table emptied) change nothing
# Compared: tables (engine, collation), columns (type, null, default, charset, collation, extra,
# generated expression), indexes, foreign keys and their rules. Column order is only reported.
# Not compared: CHECK constraints, triggers, views, data.
#
# Needs Docker and git. Migrations run in the API's dev image (Node 24), so the host's Node
# version does not matter. Exit status 1 when anything differs or a migration fails.

set -euo pipefail

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
fi

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
api="$repo/apps/api"
password=drift
engines=("$@")
[ ${#engines[@]} -gt 0 ] || engines=(mysql:8.4 mariadb:11.4)

previous=${PREVIOUS:-}
if [ -z "$previous" ]; then
    base=origin/main
    git -C "$repo" rev-parse --verify -q "$base" >/dev/null || base=main
    previous=$(git -C "$repo" merge-base HEAD "$base")
fi
git -C "$repo" cat-file -e "$previous:apps/api/db/01-schema.sql" ||
    { echo "No apps/api/db/01-schema.sql at $previous" >&2; exit 2; }

work=$(mktemp -d)
db=""
net=""
failed=0

cleanup() {
    if [ -z "${KEEP:-}" ]; then
        [ -z "$db" ] || docker rm -fv "$db" >/dev/null 2>&1 || true
        [ -z "$net" ] || docker network rm "$net" >/dev/null 2>&1 || true
    fi
    rm -rf "$work"
}
trap cleanup EXIT

# q runs one statement (-e "...") and prints rows without headers; load reads SQL from stdin
q() { docker exec -i -e MYSQL_PWD="$password" "$db" "$client" -uroot -N -B "$@" </dev/null; }
load() { docker exec -i -e MYSQL_PWD="$password" "$db" "$client" -uroot "$1"; }

# Every structural fact the app depends on, one per line, without the database name
structure() {
    q -e "
    SELECT CONCAT_WS(' | ', 'table', TABLE_NAME, ENGINE, TABLE_COLLATION)
      FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = '$1' AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME <> 'migrations'
    UNION ALL
    SELECT CONCAT_WS(' | ', 'column', TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE,
                     IFNULL(COLUMN_DEFAULT, '<none>'), IFNULL(CHARACTER_SET_NAME, ''),
                     IFNULL(COLLATION_NAME, ''), EXTRA, IFNULL(GENERATION_EXPRESSION, ''))
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = '$1' AND TABLE_NAME <> 'migrations'
    UNION ALL
    SELECT CONCAT_WS(' | ', 'index', TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME, NON_UNIQUE,
                     IFNULL(COLLATION, ''), IFNULL(SUB_PART, ''), INDEX_TYPE)
      FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = '$1' AND TABLE_NAME <> 'migrations'
    UNION ALL
    SELECT CONCAT_WS(' | ', 'foreign key', k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION,
                     k.COLUMN_NAME, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME,
                     r.UPDATE_RULE, r.DELETE_RULE)
      FROM information_schema.KEY_COLUMN_USAGE k
      JOIN information_schema.REFERENTIAL_CONSTRAINTS r
        ON r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
       AND r.TABLE_NAME = k.TABLE_NAME
     WHERE k.TABLE_SCHEMA = '$1' AND k.REFERENCED_TABLE_NAME IS NOT NULL" | LC_ALL=C sort
}

column_order() {
    q -e "SELECT CONCAT_WS(': ', TABLE_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION))
            FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = '$1' AND TABLE_NAME <> 'migrations'
           GROUP BY TABLE_NAME" | LC_ALL=C sort
}

row_counts() {
    local table
    for table in $(q -e "SELECT TABLE_NAME FROM information_schema.TABLES
                          WHERE TABLE_SCHEMA = '$1' AND TABLE_TYPE = 'BASE TABLE'
                            AND TABLE_NAME <> 'migrations' ORDER BY 1"); do
        printf '%s: %s\n' "$table" "$(q -e "SELECT COUNT(*) FROM \`$1\`.\`$table\`")"
    done
}

migrate() {
    docker run --rm --network "$net" \
        -v "$api/config:/app/config:ro" -v "$api/migrations:/app/migrations:ro" \
        -e DB_HOST="$db" -e DB_PORT=3306 -e DB_USERNAME=root -e DB_PASSWORD="$password" -e DB_NAME="$1" \
        custoro-schema-drift-api npx db-migrate up --config config/database.js >"$work/migrate.log" 2>&1 ||
        {
            echo "    a migration stopped (steps before it stay applied):"
            grep -E '^\[(INFO|ERROR)\]' "$work/migrate.log" |
                sed -e 's/AssertionError \[ERR_ASSERTION\]: ifError got unwanted exception: //' -e 's/^/      /'
            return 1
        }
}

verdict() { # label, file a, file b, "notes" (a difference that only warns)
    if diff -u "$2" "$3" >"$work/diff.txt"; then
        printf '  %-62s ok\n' "$1"
    elif [ "${4:-}" = "note" ]; then
        printf '  %-62s differs (cosmetic)\n' "$1"
        sed 's/^/      /' "$work/diff.txt"
    else
        printf '  %-62s DIFFERENT\n' "$1"
        sed 's/^/      /' "$work/diff.txt"
        failed=1
    fi
}

echo "Previous schema: $previous  ($(git -C "$repo" log -1 --format=%s "$previous" | cut -c1-60))"
docker build -q --target dev -t custoro-schema-drift-api "$api" >/dev/null

for image in "${engines[@]}"; do
    tag=$(printf '%s' "$image" | tr -c 'a-zA-Z0-9' '-')
    net="schema-drift-$$-$tag"
    db="$net-db"
    echo
    echo "== $image"

    docker network create "$net" >/dev/null
    docker run -d --name "$db" --network "$net" \
        -e MYSQL_ROOT_PASSWORD="$password" -e MARIADB_ROOT_PASSWORD="$password" "$image" >/dev/null
    client=$(docker exec "$db" sh -c 'command -v mariadb || command -v mysql')

    # The image first starts a temporary server without networking (and stops it again), so the
    # TCP port opening is what means the real server is ready; the client then uses the socket
    ready=""
    for _ in $(seq 1 120); do
        if docker exec "$db" bash -c 'exec 3<>/dev/tcp/127.0.0.1/3306' >/dev/null 2>&1 &&
            q -e 'SELECT 1' >/dev/null 2>&1; then ready=1; break; fi
        sleep 1
    done
    [ -n "$ready" ] || { echo "  the database did not start" >&2; docker logs "$db" | tail -20; exit 1; }
    echo "  server: $(q -e 'SELECT VERSION()')"

    q -e 'CREATE DATABASE fresh; CREATE DATABASE migrated'
    load fresh <"$api/db/01-schema.sql"
    load fresh <"$api/db/02-seed.sql"
    git -C "$repo" show "$previous:apps/api/db/01-schema.sql" | load migrated
    if git -C "$repo" cat-file -e "$previous:apps/api/db/02-seed.sql" 2>/dev/null; then
        git -C "$repo" show "$previous:apps/api/db/02-seed.sql" | load migrated
    fi
    if [ -n "${SEED_SQL:-}" ]; then
        printf '  loading %s into the previous schema ... ' "$(basename "$SEED_SQL")"
        started=$SECONDS
        load migrated <"$SEED_SQL"
        echo "$((SECONDS - started)) s"
    fi

    structure fresh >"$work/fresh.txt"
    column_order fresh >"$work/fresh-order.txt"
    row_counts migrated >"$work/rows-before.txt"

    started=$SECONDS
    if migrate migrated; then
        echo "  migrations on the previous schema took $((SECONDS - started)) s"
        structure migrated >"$work/migrated.txt"
        column_order migrated >"$work/migrated-order.txt"
        row_counts migrated >"$work/rows-after.txt"
        verdict "fresh schema == previous schema + migrations" "$work/fresh.txt" "$work/migrated.txt"
        verdict "column order (not a failure)" "$work/fresh-order.txt" "$work/migrated-order.txt" note
        verdict "row counts unchanged by the migrations" "$work/rows-before.txt" "$work/rows-after.txt"

        q -e 'DELETE FROM migrated.migrations'
        if migrate migrated; then
            structure migrated >"$work/again.txt"
            verdict "migrations run a second time change nothing" "$work/migrated.txt" "$work/again.txt"
        else
            failed=1
        fi
    else
        failed=1
    fi

    if migrate fresh; then
        structure fresh >"$work/fresh-after.txt"
        verdict "migrations on a fresh install change nothing" "$work/fresh.txt" "$work/fresh-after.txt"
    else
        failed=1
    fi

    if [ -n "${KEEP:-}" ]; then
        echo "  kept: docker exec -it -e MYSQL_PWD=$password $db $client -uroot migrated"
        echo "  remove: docker rm -fv $db && docker network rm $net"
        db=""
        net=""
    else
        docker rm -fv "$db" >/dev/null
        docker network rm "$net" >/dev/null
        db=""
        net=""
    fi
done

echo
if [ "$failed" -eq 0 ]; then
    echo "No schema drift."
else
    echo "Schema drift or a failed migration, see above." >&2
    exit 1
fi
