#!/usr/bin/env bash
# Builds the production images with the version and the commit they come from, so the running app
# says which build it is: GET /api/ answers {version, build, builtAt}, the web app's sidebar shows
# "v 5.0.0 · 38bdbcb", and error reports carry custoro@5.0.0+38bdbcb as their release.
#
#   scripts/docker-build.sh [service ...]     default: every image, the migrate one included
#   npm run docker:build [-- service ...]
#
# Needs git and Docker, not Node. The variables docker-compose.prod.yml requires (DB_PASSWORD and
# the rest) come from .env, as for `up`. APP_BUILD and APP_BUILT_AT already in the environment win
# (the release workflow sets them). A plain `docker compose build` still works; its images say
# "unknown" for the build.

set -euo pipefail

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo"

# One version for both apps (scripts/version.mjs keeps them equal)
APP_VERSION=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' apps/api/package.json | head -n 1)

if [ -z "${APP_BUILD:-}" ]; then
    if APP_BUILD=$(git rev-parse --short HEAD 2>/dev/null); then
        # Changed tracked files make the build differ from the commit; untracked ones (.env,
        # backups/) do not
        if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
            APP_BUILD="$APP_BUILD-dirty"
        fi
    else
        APP_BUILD=unknown
    fi
fi

APP_BUILT_AT=${APP_BUILT_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}

export APP_VERSION APP_BUILD APP_BUILT_AT

echo "Building custoro $APP_VERSION+$APP_BUILD ($APP_BUILT_AT)"

docker compose -f docker-compose.prod.yml --profile migrate build "$@"
