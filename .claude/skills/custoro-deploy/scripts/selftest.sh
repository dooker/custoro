#!/usr/bin/env bash
# Checks preflight.sh's reading of an env value against the real parsers, line by line:
#   - without Docker (--no-docker) against dotenv, the parser the API uses (run in the API's dev image)
#   - in Docker mode against Docker Compose (`docker compose config` on a one-service file)
# The two parsers disagree on purpose in places (dotenv starts a comment at any "#", Compose only at
# whitespace followed by "#"), so preflight.sh reads the value per mode. Needs Docker.
#
#   scripts/selftest.sh       prints one line per difference and a count; exit status 1 on any difference

set -uo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# One env line each, key K. Add a line here whenever a finding shows a form that was misread.
cases=(
    'K=plain'
    'K=short#abcdefghijklmnopqrstuvwxyz0123456789'
    'K=pa#ss'
    'K=a # comment'
    'K=trailing   # c'
    'K=a#b # c'
    'K="q # inside" # tail'
    "K='s # in' # tail"
    'K="a#b"'
    'K=  spaced  '
    'export K=v'
    'K = v'
    'K='
    "K=it's"
    'K="double"'
    'K="a\nb"'
    'K="a\rb"'
    'K="a\tb"'
    'K="a\\b"'
    'K="a\"b"'
    "K='a\\nb'"
    'K=a\nb'
    'K="123456789012345678901234567890\n"'
)

n=0
for line in "${cases[@]}"; do
    n=$((n + 1))
    printf '%s\n' "$line" >"$work/$n.env"
done

docker build -q --target dev -t custoro-preflight-selftest "$repo/apps/api" >/dev/null || exit 1

# dotenv: every case in one container run, one value per line
docker run --rm -v "$work:/t:ro" custoro-preflight-selftest node -e '
const dotenv = require("dotenv"), fs = require("fs");
for (let i = 1; i <= '"$n"'; i++) {
    const v = dotenv.parse(fs.readFileSync("/t/" + i + ".env")).K;
    console.log(Buffer.from(v === undefined ? "" : v).toString("hex"));
}' >"$work/dotenv.txt"

# Compose: a service that passes K through, one run per case
cat >"$work/compose.yml" <<'EOF'
services:
    t:
        image: scratch
        environment:
            K: ${K-<unset>}
EOF

# the value Compose resolves, as hex (JSON output decodes the quoting; python3 reads it)
compose_hex() {
    docker compose -f "$work/compose.yml" --env-file "$1" config --format json 2>/dev/null |
        python3 -c 'import json,sys; v=json.load(sys.stdin)["services"]["t"]["environment"]["K"]; print("" if v == "<unset>" else v.encode().hex())'
}

hex() { printf '%s' "$1" | od -An -tx1 | tr -d ' \n'; }

# preflight's own value(), taken from the script so the test cannot drift from it
envfile=""
docker=0
eval "$(sed -n '/^value() {/,/^}/p' "$here/preflight.sh")"

differences=0
checked=0
i=0
while IFS= read -r expected; do
    i=$((i + 1))
    line=${cases[$((i - 1))]}
    envfile="$work/$i.env"
    docker=0
    mine=$(value K; printf X); mine=$(hex "${mine%X}")
    checked=$((checked + 1))
    if [ "$mine" != "$expected" ]; then
        differences=$((differences + 1))
        printf 'DIFFERENT (no Docker, dotenv):  %-48s dotenv %s, preflight %s (hex)\n' "$line" "$expected" "$mine"
    fi
done <"$work/dotenv.txt"

for i in $(seq 1 "$n"); do
    line=${cases[$((i - 1))]}
    envfile="$work/$i.env"
    docker=1
    expected=$(compose_hex "$envfile")
    mine=$(value K; printf X); mine=$(hex "${mine%X}")
    checked=$((checked + 1))
    if [ "$mine" != "$expected" ]; then
        differences=$((differences + 1))
        printf 'DIFFERENT (Docker, Compose):    %-48s compose %s, preflight %s (hex)\n' "$line" "$expected" "$mine"
    fi
done

# Part B: setting() against Compose where the resolved value differs from the text of the file:
# references (also to a value with an escape, which Compose prints as a block), defaults, escapes and
# quotes. Both JSON readers are tried, python3 and jq, as far as they are installed.
cd "$repo" || exit 1
eval "$(sed -n '/^resolve_compose() {/,/^}/p; /^resolved_value_python() {/,/^}/p; /^resolved_value_jq() {/,/^}/p; /^resolved_value() {/,/^}/p; /^setting() {/,/^}/p' "$here/preflight.sh")"

setting_case() {
    local name=$1 expected=$2 got reader
    shift 2
    printf '%s\n' "APP_ORIGIN=https://x.example.com" "TRUST_PROXY=1" "DB_USERNAME=u" "DB_PASSWORD=p" "DB_ROOT_PASSWORD=r" "$@" >"$work/b.env"
    envfile="$work/b.env"
    docker=1
    resolved=""
    resolve_compose
    if [ -z "$resolved" ]; then differences=$((differences + 1)); printf 'DIFFERENT (setting):             %-34s Compose did not resolve the file\n' "$name"; return; fi
    got=$(setting JWT_SECRET; printf X)
    got=${got%X}
    checked=$((checked + 1))
    if [ "$got" != "$expected" ]; then
        differences=$((differences + 1))
        printf 'DIFFERENT (setting):             %-34s expected %s, got %s (hex)\n' "$name" "$(hex "$expected")" "$(hex "$got")"
    fi
    for reader in python jq; do
        command -v "$([ "$reader" = python ] && echo python3 || echo jq)" >/dev/null 2>&1 || continue
        got=$(resolved_value_"$reader" JWT_SECRET)
        got=${got%X}
        checked=$((checked + 1))
        if [ "$got" != "$expected" ]; then
            differences=$((differences + 1))
            printf 'DIFFERENT (%s reader):%*s %-34s expected %s, got %s (hex)\n' "$reader" $((12 - ${#reader})) "" "$name" "$(hex "$expected")" "$(hex "$got")"
        fi
    done
}

setting_case "plain" "abcdef" "JWT_SECRET=abcdef"
setting_case "reference" "short" "REF=short" 'JWT_SECRET=${REF}'
setting_case "reference to an escape" $'abc\n' 'REF="abc\n"' 'JWT_SECRET=${REF}'
setting_case "default" "0123456789" 'JWT_SECRET=${NOT_SET_ANYWHERE:-0123456789}'
setting_case "escape" $'12\n34' 'JWT_SECRET="12\n34"'
setting_case "quoted hash" "a # b" 'JWT_SECRET="a # b"'

printf '%d comparisons, %d different\n' "$checked" "$differences"
[ "$differences" -eq 0 ]
