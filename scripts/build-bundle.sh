#!/usr/bin/env bash
# Builds the release bundle for a server without Docker: one custoro-<version>.tar.gz with the
# built API, the built web app, the database migrations and the server scripts (deploy/server).
# The server installs it with deploy/server/custoro.sh and needs only Node 24 and nginx.
#
#   scripts/build-bundle.sh [out dir]          default: bundle/ (git ignores it)
#
# Builds inside Docker with the same Dockerfiles as the images, so this machine needs Docker and
# git, not Node 24. The version is the one of package.json; the build is the git commit (with
# "-dirty" for changed tracked files), as in scripts/docker-build.sh. APP_BUILD and APP_BUILT_AT
# already in the environment win (the release workflow sets them).
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo"

out=${1:-bundle}
version=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' apps/api/package.json | head -n 1)

if [ -z "${APP_BUILD:-}" ]; then
    if APP_BUILD=$(git rev-parse --short HEAD 2>/dev/null); then
        if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
            APP_BUILD="$APP_BUILD-dirty"
        fi
    else
        APP_BUILD=unknown
    fi
fi
APP_BUILT_AT=${APP_BUILT_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}

name="custoro-$version"
work=$(mktemp -d)
api_box=""
web_box=""
cleanup() {
    rm -rf "$work"
    [ -n "$api_box" ] && docker rm -f "$api_box" >/dev/null 2>&1 || true
    [ -n "$web_box" ] && docker rm -f "$web_box" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Building $name+$APP_BUILD ($APP_BUILT_AT)"

# The build stages of the images: the API compiled by tsc, the web app built by Vite
docker build -q --target build -t "custoro-bundle-api:$APP_BUILD" apps/api >/dev/null
docker build -q --target build -f apps/web/Dockerfile \
    --build-arg VITE_API_ENDPOINT=/api \
    --build-arg APP_BUILD="$APP_BUILD" \
    --build-arg APP_BUILT_AT="$APP_BUILT_AT" \
    -t "custoro-bundle-web:$APP_BUILD" . >/dev/null

mkdir -p "$work/$name/api/scripts" "$work/$name/deploy/nginx" "$work/$name/db"
api_box=$(docker create "custoro-bundle-api:$APP_BUILD")
web_box=$(docker create "custoro-bundle-web:$APP_BUILD")

# The API without node_modules: the server installs them for its own platform (npm ci), and
# the migration tool with them, then drops what only the build and the migrations need
for item in dist package.json package-lock.json .npmrc locales assets migrations config; do
    docker cp -q "$api_box:/app/$item" "$work/$name/api/$item"
done
docker cp -q "$api_box:/app/scripts/migrate.js" "$work/$name/api/scripts/migrate.js"
docker cp -q "$web_box:/app/apps/web/dist" "$work/$name/web"

# Which build this is: GET /api/ and error reports name it (the systemd unit reads this file)
printf 'APP_BUILD=%s\nAPP_BUILT_AT=%s\n' "$APP_BUILD" "$APP_BUILT_AT" >"$work/$name/api/build-info.env"
printf '%s\n' "$version" >"$work/$name/VERSION"
# The schema and the config seed, for a first install on an empty database (the image never has
# them: the database container loads them)
cp apps/api/db/01-schema.sql apps/api/db/02-seed.sql "$work/$name/db/"

# The server scripts, and the nginx site of the web image with this server's paths: the files
# in /opt/custoro/current/web, the API on 127.0.0.1, the header snippets from the bundle
cp deploy/server/custoro.sh deploy/server/custoro-api.service deploy/server/README.md \
    "$work/$name/deploy/"
# The header snippets include each other by path: the bundle's paths too
for snippet in apps/web/nginx/*.conf; do
    sed 's|/etc/nginx/snippets/|/opt/custoro/current/deploy/nginx/|g' "$snippet" \
        >"$work/$name/deploy/nginx/$(basename "$snippet")"
done
cp apps/api/.env.production.example "$work/$name/deploy/env.production.example"
sed -e 's|root /usr/share/nginx/html;|root /opt/custoro/current/web;|' \
    -e 's|proxy_pass http://api:3999/;|proxy_pass http://127.0.0.1:3999/;|' \
    -e 's|-> http://api:3999/|-> http://127.0.0.1:3999/|' \
    -e 's|/etc/nginx/snippets/|/opt/custoro/current/deploy/nginx/|g' \
    -e 's|^# Production web server: serves the built SPA and proxies /api/\* to the API container.|# Custoro on a server without Docker: serves the built SPA and proxies /api/* to the API.|' \
    apps/web/nginx.conf >"$work/$name/deploy/nginx/custoro-site.conf"

# Every replacement must have happened, or the site would point at the container's paths
for wanted in 'root /opt/custoro/current/web;' 'proxy_pass http://127.0.0.1:3999/;'; do
    grep -qF "$wanted" "$work/$name/deploy/nginx/custoro-site.conf" ||
        { echo "build-bundle: the nginx site lacks '$wanted'; apps/web/nginx.conf changed" >&2; exit 1; }
done
if grep -l '/etc/nginx/snippets/\|http://api:' "$work/$name"/deploy/nginx/*.conf; then
    echo "build-bundle: the nginx files above still point at the container" >&2
    exit 1
fi

mkdir -p "$out"
# Plain files for any Linux tar: no macOS metadata or extended attributes, owned by root
if tar --version 2>/dev/null | grep -q bsdtar; then
    COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata --uid 0 --gid 0 --uname root --gname root \
        -czf "$out/$name.tar.gz" -C "$work" "$name"
else
    tar --no-xattrs --owner=0 --group=0 --numeric-owner -czf "$out/$name.tar.gz" -C "$work" "$name"
fi
(cd "$out" && { sha256sum "$name.tar.gz" 2>/dev/null || shasum -a 256 "$name.tar.gz"; } >"$name.tar.gz.sha256")
echo "$out/$name.tar.gz ($(du -h "$out/$name.tar.gz" | cut -f1))"
