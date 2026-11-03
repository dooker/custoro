#!/usr/bin/env bash
# Backs up the production Docker stack (docker-compose.prod.yml): the database and the two volumes.
#
#   apps/api/scripts/backup.sh [--dir DIR] [--project NAME] [--env-file FILE] [-f COMPOSE_FILE]...
#
#   --dir DIR        where the dated folder goes (default: backups/ in the repository root, which
#                    git ignores). The backup holds password hashes and customer data: keep it
#                    private, and copy it off this machine, a backup on the same disk is lost with it
#   --project NAME   the Docker Compose project (default: the one the compose file names, "custoro")
#   --env-file FILE  the .env file Compose reads (default: .env next to docker-compose.prod.yml)
#   -f FILE          compose file, repeatable like docker compose -f (default: docker-compose.prod.yml)
#
# Writes DIR/custoro-<UTC time>/ with
#   db.sql.gz        mysqldump --single-transaction, run inside the db container with the password
#                    from that container's environment (never printed, never on a command line)
#   uploads.tar.gz   the uploads volume (logos and avatars)
#   invoices.tar.gz  the invoices volume (generated invoice PDFs)
#   SHA256SUMS       checksums of those three, checked again before a restore
#   manifest.txt     when, which project, which database server
# The folder is built as <name>.partial and renamed when everything is checked, so a folder without
# ".partial" is a complete backup. The dump comes first and the files after it, so every file the
# dump refers to is in the archives (the other way round, a file added in between would be missing).
#
# Stops without keeping anything when the dump is empty, cut off or has no rows. The API may keep
# running; for a copy that matches to the second, stop it first (docker compose stop api), as the
# deploy runbook does before a migration. Files that change while they are archived are noted and
# kept. The mail server settings the admin page saves are in /app/.env.email inside the API
# container, in no volume, so they are not part of any backup: keep EMAIL_* in .env.
#
# Needs Docker with the compose plugin, bash, gzip and tar on this machine, and the db service
# running. The MySQL 8.4 and MariaDB 11.4 images both work. Restore with restore.sh, into a db service
# of the same kind (MySQL or MariaDB) as this one: a dump does not load into the other kind.

set -euo pipefail

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
fi

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=$(cd "$here/../../.." && pwd)
# shellcheck source=backup-lib.sh
. "$here/backup-lib.sh"

dir=""
project=""
env_file=""
compose_files=()
while [ $# -gt 0 ]; do
    case $1 in
        --dir) dir=${2:?--dir needs a folder}; shift 2 ;;
        --project) project=${2:?--project needs a name}; shift 2 ;;
        --env-file) env_file=${2:?--env-file needs a file}; shift 2 ;;
        -f) compose_files+=("${2:?-f needs a compose file}"); shift 2 ;;
        *) die "unknown argument: $1 (see --help)" ;;
    esac
done
[ -n "$dir" ] || dir="$repo/backups"
build_compose

# Everything below is for the owner only
umask 077

command -v docker >/dev/null 2>&1 || die "docker is not installed or not on the PATH"
db_id=$(compose ps -q db) || die "docker compose could not read the stack (is DB_ROOT_PASSWORD etc. set in .env, or --env-file given?)"
[ -n "$db_id" ] || die "the db service is not running: start it with  docker compose -f docker-compose.prod.yml up -d --wait db"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
final="$dir/custoro-$stamp"
work="$final.partial"
mkdir -p "$dir"
[ ! -e "$final" ] && [ ! -e "$work" ] || die "$final already exists (two backups in the same second?)"
mkdir "$work"
cleanup() {
    if [ -n "${work:-}" ]; then rm -rf "$work"; fi
}
trap cleanup EXIT

echo "Dumping the database ..."
if ! compose exec -T db sh -c "$dump_script" </dev/null | gzip -c >"$work/db.sql.gz"; then
    die "the database dump failed (see the messages above); nothing was kept"
fi
problem=$(dump_problem "$work/db.sql.gz") ||
    die "refusing to go on, $problem. No volume was archived and nothing was kept."

# archive_volume NAME MOUNT_POINT: the volume's files as NAME.tar.gz, read through the api service
# (tar exit 1 means files changed while being read, anything above that is a failure)
archive_volume() {
    local name=$1 path=$2 status=0
    echo "Archiving the $name volume ..."
    compose run --rm --no-deps -T --user root --entrypoint tar api \
        -czf - --numeric-owner -C "$path" . </dev/null >"$work/$name.tar.gz" || status=$?
    case $status in
        0) ;;
        1) echo "warning: files in the $name volume changed while they were archived (the API is running); the archive is kept" >&2 ;;
        *) die "archiving the $name volume failed (tar/docker exit $status, see the messages above); nothing was kept" ;;
    esac
    problem=$(archive_problem "$work/$name.tar.gz") || die "$problem; nothing was kept"
}
archive_volume uploads "$uploads_path"
archive_volume invoices "$invoices_path"

(
    cd "$work"
    printf '%s  %s\n' \
        "$(sha256_of db.sql.gz)" db.sql.gz \
        "$(sha256_of uploads.tar.gz)" uploads.tar.gz \
        "$(sha256_of invoices.tar.gz)" invoices.tar.gz >SHA256SUMS
)

project_name=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$db_id") ||
    project_name=unknown
server=$(gzip -dc "$work/db.sql.gz" 2>/dev/null | head -n 30 | sed -n 's/^-- Server version[[:space:]]*//p' | head -n 1 || true)
{
    echo "Custoro backup"
    echo "created:  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "project:  $project_name"
    echo "server:   ${server:-unknown}"
    echo "files:    db.sql.gz uploads.tar.gz invoices.tar.gz (checksums in SHA256SUMS)"
    echo "restore:  apps/api/scripts/restore.sh <this folder>"
} >"$work/manifest.txt"

mv "$work" "$final"
work=""

echo
echo "Backup written to $final"
for name in db.sql.gz uploads.tar.gz invoices.tar.gz; do
    printf '  %-16s %s\n' "$name" "$(du -h "$final/$name" | cut -f1)"
done
echo "Copy that folder off this machine, and rehearse a restore before you need one."
