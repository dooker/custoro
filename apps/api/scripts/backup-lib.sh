# Shared by backup.sh and restore.sh. Sourced, never run. Plain bash 3.2 (macOS) is enough.

# Where docker-compose.prod.yml mounts the two volumes in the api container. The volumes are read and
# written through that container (docker compose run api), so they need no volume name and no extra
# image. helpers/backupScripts.test.ts checks these against the compose file.
uploads_path=/app/uploads
invoices_path=/app/storage

# These run inside the db container with `sh -c`. The password is never read on the host: the
# single-quoted text holds the *name* of the variable, and the shell in the container fills it in from
# the container's own environment, into MYSQL_PWD, which (unlike -p) does not show up in `ps`.
# The client is whichever the image has: MySQL 8.4 ships mysqldump and mysql, MariaDB 11.4 the
# mariadb-dump and mariadb names.
# --single-transaction: one consistent snapshot of the InnoDB tables while the API keeps writing.
dump_script='dump=$(command -v mariadb-dump || command -v mysqldump) || { echo "no mysqldump or mariadb-dump in the db container" >&2; exit 127; }
export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
exec "$dump" -uroot --single-transaction --routines --triggers --events --default-character-set=utf8mb4 "$MYSQL_DATABASE"'

# Drops the database and creates it again the way the image does on its first start (server defaults),
# so tables that are in the database but not in the backup do not survive. The app user's grant on
# the database name stays, MySQL and MariaDB both keep grants when a database is dropped.
reset_script='client=$(command -v mariadb || command -v mysql) || { echo "no mysql or mariadb client in the db container" >&2; exit 127; }
export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
exec "$client" -uroot -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\`"'

# Reads SQL on stdin into the database. The client stops at the first error and exits non-zero.
load_script='client=$(command -v mariadb || command -v mysql) || { echo "no mysql or mariadb client in the db container" >&2; exit 127; }
export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
exec "$client" -uroot --default-character-set=utf8mb4 "$MYSQL_DATABASE"'

# The server's version string: "8.4.11" on MySQL, "11.4.13-MariaDB-ubu2404" on MariaDB
version_script='client=$(command -v mariadb || command -v mysql) || { echo "no mysql or mariadb client in the db container" >&2; exit 127; }
export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
exec "$client" -uroot -N -B -e "SELECT VERSION()"'

# Exact row count of every table, one "table<TAB>count" line each
counts_script='client=$(command -v mariadb || command -v mysql) || exit 127
export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
for t in $("$client" -uroot -N -B "$MYSQL_DATABASE" -e "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = '"'"'BASE TABLE'"'"' ORDER BY 1"); do
    printf "%s\t%s\n" "$t" "$("$client" -uroot -N -B "$MYSQL_DATABASE" -e "SELECT COUNT(*) FROM \`$t\`")"
done'

# Empties a volume's mount point and unpacks the archive on stdin into it. $1 is the mount point.
# As root, so files of any owner can be removed and tar gives the files back the owners they had
# (numeric: the API's user is uid 1000 in its image).
untar_script='find "$1" -mindepth 1 -delete && exec tar -xzf - --numeric-owner -C "$1"'

die() {
    echo "error: $*" >&2
    exit 1
}

# The docker compose command for the chosen compose files, project and env file. Needs $repo,
# $project, $env_file and the array $compose_files, which the scripts fill from their options.
build_compose() {
    local file
    compose_cmd=(docker compose)
    if [ ${#compose_files[@]} -eq 0 ]; then
        compose_cmd+=(-f "$repo/docker-compose.prod.yml")
    else
        for file in "${compose_files[@]}"; do
            compose_cmd+=(-f "$file")
        done
    fi
    if [ -n "$project" ]; then compose_cmd+=(-p "$project"); fi
    if [ -n "$env_file" ]; then compose_cmd+=(--env-file "$env_file"); fi
}

compose() { "${compose_cmd[@]}" "$@"; }

# The checksum of one file, whichever tool this machine has (Linux: sha256sum, macOS: shasum)
sha256_of() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1"
    else
        shasum -a 256 "$1"
    fi | awk '{ print $1 }'
}

# verify_checksums DIR NAME...: each NAME has a line in DIR/SHA256SUMS and the file still has that
# checksum. Says what is wrong on stderr and returns 1.
verify_checksums() {
    local dir=$1 name expected bad=0
    shift
    if [ ! -f "$dir/SHA256SUMS" ]; then
        echo "SHA256SUMS is missing" >&2
        return 1
    fi
    for name in "$@"; do
        expected=$(awk -v n="$name" '$2 == n { print $1 }' "$dir/SHA256SUMS")
        if [ -z "$expected" ]; then
            echo "$name has no checksum in SHA256SUMS" >&2
            bad=1
        elif [ ! -f "$dir/$name" ]; then
            echo "$name is missing" >&2
            bad=1
        elif [ "$(sha256_of "$dir/$name")" != "$expected" ]; then
            echo "$name does not match its checksum (damaged or changed)" >&2
            bad=1
        fi
    done
    return $bad
}

# dump_problem FILE: prints why FILE (a gzipped mysqldump) must not be trusted, and returns 1; prints
# nothing and returns 0 for a complete dump with tables and rows. A complete mysqldump or
# mariadb-dump ends with a "-- Dump completed" line, so a dump that was cut off, or whose tool died
# after printing the first lines, does not pass.
dump_problem() {
    local file=$1 facts tables rows last
    if [ ! -s "$file" ]; then
        echo "the dump file is empty"
        return 1
    fi
    # Tested on its own: a failing gzip in the pipe below only shows when the caller set pipefail
    if ! gzip -t "$file" 2>/dev/null; then
        echo "the dump is not a complete gzip file (cut off?)"
        return 1
    fi
    facts=$(gzip -dc "$file" | awk '
        /^CREATE TABLE / { tables++ }
        /^INSERT INTO /  { rows++ }
        NF               { last = substr($0, 1, 40) }
        END              { printf "%d %d %s\n", tables, rows, last }')
    tables=${facts%% *}
    rows=${facts#* }
    last=${rows#* }
    rows=${rows%% *}
    if [ "$tables" = 0 ] && [ "$last" = "" ]; then
        echo "the dump is empty: the dump tool printed nothing"
        return 1
    fi
    case $last in
        "-- Dump completed"*) ;;
        *)
            echo "the dump is incomplete: it does not end with the 'Dump completed' line (the dump tool stopped early)"
            return 1
            ;;
    esac
    if [ "$tables" = 0 ]; then
        echo "the dump has no tables (wrong database?)"
        return 1
    fi
    if [ "$rows" = 0 ]; then
        echo "the dump has $tables tables but no rows (wrong database, or the data is gone)"
        return 1
    fi
    return 0
}

# engine_problem FILE TARGET_VERSION: prints why the dump FILE cannot be loaded by a server whose
# version string is TARGET_VERSION, and returns 1, before anything is dropped. A dump with a
# generated column (the invoices table has one, number_sort) only loads into the kind of server that
# made it. MySQL into MariaDB: mysqldump writes the expression in MySQL's own form, here
# regexp_like(), and MariaDB refuses it (error 1901). MariaDB into MySQL: mariadb-dump writes the
# generated value into each INSERT and MySQL refuses it (error 3105); no option of either tool
# changes that. A dump without a generated column is not held back.
engine_problem() {
    local facts source generated source_kind target_kind detail
    facts=$(gzip -dc "$1" | awk -F'\t' '
        !seen && /^-- Server version/ { server = $2; seen = 1 }
        /GENERATED ALWAYS AS/         { generated = 1 }
        END                           { printf "%s\t%d\n", server, generated }')
    source=${facts%%$'\t'*}
    generated=${facts##*$'\t'}
    [ "$generated" = 1 ] && [ -n "$source" ] || return 0
    case $source in *MariaDB*) source_kind=MariaDB ;; *) source_kind=MySQL ;; esac
    case $2 in *MariaDB*) target_kind=MariaDB ;; *) target_kind=MySQL ;; esac
    [ "$source_kind" != "$target_kind" ] || return 0
    if [ "$source_kind" = MariaDB ]; then
        detail="MariaDB's dump tool writes the generated value into each INSERT, which MySQL refuses"
    else
        detail="MySQL's dump tool writes the column's expression in its own form (regexp_like() for a REGEXP), which MariaDB refuses"
    fi
    echo "this dump was made by $source_kind ($source) and has a generated column, which the target server, $target_kind ($2), cannot load: $detail. Restore it into a db service of the same kind as the backup"
    return 1
}

# archive_problem FILE: prints why FILE is not a readable .tar.gz and returns 1. An empty volume
# makes a small valid archive, so only a missing, cut off or foreign file fails.
archive_problem() {
    if [ ! -f "$1" ]; then
        echo "$1 is missing"
        return 1
    fi
    if ! tar -tzf "$1" >/dev/null 2>&1; then
        echo "$(basename "$1") is not a complete .tar.gz archive"
        return 1
    fi
    return 0
}
