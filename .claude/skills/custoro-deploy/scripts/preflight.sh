#!/usr/bin/env bash
# Pre-flight for a production deploy. Reads files and git only: it never connects to a server or a
# database and never prints a secret (variables are reported as set, unset or by length).
#
#   preflight.sh [env-file] [--deployed <git ref>] [--no-docker]
#
#   env-file     the production .env to check (default: .env in the repository root)
#   --no-docker  the API runs without Docker: env-file is apps/api/.env.production, and the checks
#                are for its variables instead of the ones docker-compose.prod.yml requires
#   --deployed   the commit or tag that runs on the server now: lists the migrations added since,
#                the images that need a rebuild, and changes to the compose and env example files
#
# Checks: clean tree and branch, the variables docker-compose.prod.yml requires (read from its
# ${VAR:?...} entries) are set in the env file and in the CI docker job, JWT_SECRET length, TRUST_PROXY,
# APP_ORIGIN, the compose file resolves with this env file; prints the migrations and the bold
# deploy notes of the changelog. Exit status 1 when something FAILs; warnings do not fail.

set -uo pipefail

repo=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
cd "$repo"

envfile=.env
deployed=""
docker=1

while [ $# -gt 0 ]; do
    case "$1" in
        -h | --help) sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        --deployed) deployed=${2:-}; shift 2 ;;
        --no-docker) docker=0; shift ;;
        *) envfile=$1; shift ;;
    esac
done

fail=0
ok() { printf '  ok    %s\n' "$*"; }
bad() { printf '  FAIL  %s\n' "$*"; fail=1; }
warn() { printf '  warn  %s\n' "$*"; }

# Value of a variable in a compose env file (last assignment wins, optional quotes removed)
value() { grep -E "^[[:space:]]*$1=" "$envfile" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }

echo "Git"
branch=$(git rev-parse --abbrev-ref HEAD)
commit=$(git rev-parse --short HEAD)
printf '  %s at %s: %s\n' "$branch" "$commit" "$(git log -1 --format=%s | cut -c1-70)"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then bad "uncommitted changes in tracked files"; else ok "working tree clean"; fi
if [ "$branch" = main ]; then ok "on main"; else warn "not on main (a deploy is normally main)"; fi
if git rev-parse --verify -q origin/main >/dev/null; then
    if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then ok "HEAD is origin/main (as of the last fetch)"
    else warn "HEAD is not origin/main: run git fetch, then check you deploy what was merged"; fi
fi

echo
echo "Environment file: $envfile"
if [ ! -f "$envfile" ]; then
    bad "no such file (copy .env.production.example and fill it in; never commit it)"
else
    if [ "$docker" = 1 ]; then
        required=$(grep -o '\${[A-Z_]*:?' docker-compose.prod.yml | tr -d '${:?' | sort -u)
    else
        required="DB_HOST DB_USERNAME DB_PASSWORD DB_NAME APP_ORIGIN JWT_SECRET"
    fi
    for name in $required; do
        if [ -n "$(value "$name")" ]; then ok "$name is set"; else bad "$name is required and is empty or missing"; fi
        if [ "$docker" = 1 ] && ! grep -qE "^[[:space:]]+$name:" .github/workflows/ci.yml; then
            bad "$name is required by docker-compose.prod.yml but the CI docker job does not set it (add it to ci.yml, PR 5 broke on this)"
        fi
    done

    secret=$(value JWT_SECRET)
    if [ -n "$secret" ]; then
        if [ "${#secret}" -ge 32 ]; then ok "JWT_SECRET has ${#secret} characters"; else bad "JWT_SECRET has ${#secret} characters, production refuses fewer than 32 (openssl rand -hex 32)"; fi
    fi

    proxy=$(value TRUST_PROXY)
    case "$proxy" in
        1) ok "TRUST_PROXY=1 (people reach nginx directly)" ;;
        2) ok "TRUST_PROXY=2 (a TLS proxy such as Caddy is in front of nginx)" ;;
        "") [ "$docker" = 0 ] && warn "TRUST_PROXY is not set: the API logs a warning and believes every private-network hop in X-Forwarded-For" ;;
        *) warn "TRUST_PROXY=$proxy: only 1 or 2 are the documented values, check it matches the proxies in front" ;;
    esac

    origin=$(value APP_ORIGIN)
    case "$origin" in
        https://*) ok "APP_ORIGIN is https" ;;
        "") ;;
        *) warn "APP_ORIGIN is not https: links in emails and CORS use it" ;;
    esac
    case "$origin" in */) warn "APP_ORIGIN ends with a slash" ;; esac

    [ "$(value EMAIL_REQUIRE_TLS)" = false ] && warn "EMAIL_REQUIRE_TLS=false sends the mail login in plain text: only for a mail server on the same machine"
    [ "$(value DB_SSL)" = off ] && warn "DB_SSL=off: only over a trusted path (same host, SSH tunnel, private network)"
    [ -n "$(value EMAIL_HOST)" ] && [ -z "$(value EMAIL_FROM)" ] && warn "EMAIL_HOST is set but EMAIL_FROM is empty"

    if [ "$docker" = 0 ]; then
        :
    elif docker info >/dev/null 2>&1; then
        if docker compose -f docker-compose.prod.yml --env-file "$envfile" config -q 2>/dev/null; then ok "docker-compose.prod.yml resolves with this env file"; else bad "docker compose config failed with this env file"; fi
    else
        warn "Docker is not running: compose config not checked"
    fi
fi

echo
echo "Migrations in this commit: $(find apps/api/migrations -name '*.js' | wc -l | tr -d ' ')"
find apps/api/migrations -name '*.js' | sort | tail -5 | sed 's|.*/|  |'

if [ -n "$deployed" ]; then
    echo
    echo "Since $deployed"
    if ! git rev-parse --verify -q "$deployed^{commit}" >/dev/null; then
        bad "unknown commit or tag: $deployed"
    else
        git log --oneline "$deployed..HEAD" | sed 's/^/  /' | head -30
        added=$(git diff --name-only --diff-filter=AM "$deployed..HEAD" -- apps/api/migrations | sed 's|.*/||')
        if [ -n "$added" ]; then echo "  new or changed migrations (run them, after a backup):"; echo "$added" | sed 's/^/    /'; else echo "  no new migrations"; fi
        changed=$(git diff --name-only "$deployed..HEAD")
        echo "$changed" | grep -q '^apps/api/' && echo "  rebuild: API image (apps/api changed)"
        echo "$changed" | grep -qE '^(apps/web/|CHANGELOG.md)' && echo "  rebuild: web image (apps/web or CHANGELOG.md changed; the image copies the changelog)"
        for f in docker-compose.prod.yml .env.production.example apps/api/.env.production.example apps/web/nginx.conf; do
            echo "$changed" | grep -qx "$f" && echo "  review: $f changed, compare with the server's .env and nginx setup"
        done
    fi
fi

echo
echo "Deploy actions in CHANGELOG.md > Unreleased (bold text with must, required, backup, rebuild or before):"
notes=$(awk '/^## Unreleased/ { on = 1; next } /^## / { on = 0 } on' CHANGELOG.md | tr '\n' ' ' | sed 's/  */ /g' | grep -o '\*\*[^*]*\*\*' | grep -iE 'must|required|backup|rebuild|before' | sort -u)
if [ -n "$notes" ]; then echo "$notes" | sed 's/^/  - /'; else echo "  none"; fi

echo
if [ "$fail" -eq 0 ]; then echo "Pre-flight passed."; else echo "Pre-flight FAILED, see above." >&2; exit 1; fi
