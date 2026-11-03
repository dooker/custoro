#!/usr/bin/env bash
# Restores a backup made by backup.sh into the production Docker stack, replacing what is there.
#
#   apps/api/scripts/restore.sh BACKUP_FOLDER [--yes] [--db-only] [--project NAME]
#                               [--env-file FILE] [-f COMPOSE_FILE]...
#
#   BACKUP_FOLDER    a custoro-<time> folder written by backup.sh
#   --yes            do not ask. Without it you must type the project name to go on
#   --db-only        restore the database and leave the uploads and invoices volumes alone (a
#                    rollback after a migration, when no files changed)
#   --project, --env-file, -f    as in backup.sh
#
# THIS OVERWRITES DATA. It stops the api service, drops every table of the database and loads the
# dump, then (unless --db-only) empties the uploads and invoices volumes and unpacks the archives.
# Anything written since the backup is lost. If you may want it, run backup.sh first.
#
# Before it changes anything it checks the backup: the checksums, that the dump is complete (it ends
# with "Dump completed", has tables and rows) and that the archives are readable. The db service must
# be running (a new server: docker compose -f docker-compose.prod.yml up -d --wait db, which loads the
# schema and seed; the dump then replaces them). The API stays stopped afterwards: start it, with the
# image that matches the backup's schema, when you have looked at the row counts printed at the end.
#
# The dump has no CREATE DATABASE and no USE, it loads into the database of the db service. It loads
# into the same kind of server only: a MySQL 8.4 dump into MySQL, a MariaDB 11.4 dump into MariaDB.
# Across the two, the invoices table's generated column makes the load fail (each dump tool writes it
# in a form the other server refuses), so restore.sh says so before it changes anything. See the
# rehearsal in the custoro-deploy skill (scripts/rehearse-backup.sh).

set -euo pipefail

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
fi

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=$(cd "$here/../../.." && pwd)
# shellcheck source=backup-lib.sh
. "$here/backup-lib.sh"

backup=""
yes=0
db_only=0
project=""
env_file=""
compose_files=()
while [ $# -gt 0 ]; do
    case $1 in
        --yes) yes=1; shift ;;
        --db-only) db_only=1; shift ;;
        --project) project=${2:?--project needs a name}; shift 2 ;;
        --env-file) env_file=${2:?--env-file needs a file}; shift 2 ;;
        -f) compose_files+=("${2:?-f needs a compose file}"); shift 2 ;;
        -*) die "unknown argument: $1 (see --help)" ;;
        *)
            [ -z "$backup" ] || die "only one backup folder, got $backup and $1"
            backup=${1%/}
            shift
            ;;
    esac
done
[ -n "$backup" ] || die "which backup? Give the folder backup.sh wrote (see --help)"
build_compose

# 1. Check the backup before touching anything
[ -d "$backup" ] || die "$backup is not a folder"
case $backup in
    *.partial) die "$backup is an unfinished backup (.partial), use a complete one" ;;
esac
[ -f "$backup/db.sql.gz" ] || die "$backup is not a backup folder: db.sql.gz is missing"

files=(db.sql.gz)
if [ "$db_only" = 0 ]; then files+=(uploads.tar.gz invoices.tar.gz); fi
verify_checksums "$backup" "${files[@]}" || die "the backup is damaged, nothing was changed"
problem=$(dump_problem "$backup/db.sql.gz") || die "the dump in this backup cannot be used, $problem. Nothing was changed."
if [ "$db_only" = 0 ]; then
    for name in uploads invoices; do
        problem=$(archive_problem "$backup/$name.tar.gz") || die "$problem. Nothing was changed."
    done
fi

# 2. The stack to overwrite
command -v docker >/dev/null 2>&1 || die "docker is not installed or not on the PATH"
db_id=$(compose ps -q db) || die "docker compose could not read the stack (is DB_ROOT_PASSWORD etc. set in .env, or --env-file given?)"
[ -n "$db_id" ] || die "the db service is not running: start it with  docker compose -f docker-compose.prod.yml up -d --wait db"
project_name=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$db_id") ||
    die "cannot tell which compose project the db container belongs to"
[ -n "$project_name" ] || die "cannot tell which compose project the db container belongs to"

target_version=$(compose exec -T db sh -c "$version_script" </dev/null) || die "cannot ask the db service for its version"
problem=$(engine_problem "$backup/db.sql.gz" "$target_version") || die "$problem. Nothing was changed."

created=$(sed -n 's/^created:[[:space:]]*//p' "$backup/manifest.txt" 2>/dev/null | head -n 1 || true)
echo "This replaces the data of the Docker project \"$project_name\" with the backup ${backup##*/} (made ${created:-at an unknown time}):"
echo "  database   every table of the db service is dropped, then loaded from db.sql.gz"
if [ "$db_only" = 0 ]; then
    echo "  volumes    uploads and invoices are emptied, then unpacked from the archives"
else
    echo "  volumes    left alone (--db-only)"
fi
echo "  api        stopped first, and left stopped"
echo "Everything written since the backup is lost."
if [ "$yes" = 0 ]; then
    printf 'Type the project name (%s) to go on: ' "$project_name"
    answer=""
    read -r answer || true
    [ "$answer" = "$project_name" ] || die "not confirmed, nothing was changed"
fi

# 3. Overwrite
echo "Stopping the api service ..."
compose stop api </dev/null

echo "Loading the database ..."
compose exec -T db sh -c "$reset_script" </dev/null ||
    die "could not reset the database. Nothing was loaded; run restore.sh again once it is fixed."
if ! gzip -dc "$backup/db.sql.gz" | compose exec -T db sh -c "$load_script"; then
    die "loading the dump failed (see above). The database is now EMPTY OR INCOMPLETE: fix the cause and run restore.sh again with the same backup."
fi

# restore_volume NAME MOUNT_POINT
restore_volume() {
    local name=$1 path=$2
    echo "Restoring the $name volume ..."
    compose run --rm --no-deps -T --user root --entrypoint sh api -c "$untar_script" sh "$path" <"$backup/$name.tar.gz" ||
        die "unpacking $name.tar.gz failed (see above). The $name volume is now EMPTY OR INCOMPLETE: run restore.sh again with the same backup."
}
if [ "$db_only" = 0 ]; then
    restore_volume uploads "$uploads_path"
    restore_volume invoices "$invoices_path"
fi

echo
echo "Rows per table now:"
compose exec -T db sh -c "$counts_script" </dev/null | sed 's/^/  /'
echo
echo "Restored. The api service is stopped. Start it with the images that match this backup's schema:"
echo "  docker compose -f docker-compose.prod.yml up -d"
echo "(a backup made before a migration needs the previous images, or the migrate service run first)"
