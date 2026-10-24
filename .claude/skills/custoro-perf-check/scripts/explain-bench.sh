#!/usr/bin/env bash
# Times SELECT statements the way the 2026 database and query reviews did: every statement runs once
# to warm up, then N times under EXPLAIN ANALYZE (MySQL) or ANALYZE FORMAT=JSON (MariaDB); the
# table shows the median of the executor time. Needs Docker and a running MySQL or MariaDB container.
#
#   explain-bench.sh run     [target] [-n runs] <statements.sql> [out.tsv]
#   explain-bench.sh digest  [target] <statements.sql>          rows and a checksum of each result
#   explain-bench.sh compare <before.tsv> <after.tsv>            the Before / After table for a PR
#
#   target:  -p <compose project> (its `db` service; default `custoro`) or -c <container>,
#            and -d <database> (default custoro). The login is root with the container's
#            MYSQL_ROOT_PASSWORD (MARIADB_ROOT_PASSWORD on MariaDB).
#   -n 6     timed runs per statement (after the warm-up run)
#
# statements.sql: `-- name: <label>` then one SELECT ending in `;`, see references/statements.example.sql.
# The statements really run, so they are checked twice: an entry must be one SELECT or WITH with no
# second statement and no INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, CALL, LOAD,
# INTO OUTFILE or DUMPFILE outside quotes, and every run is in a READ ONLY session, so the server
# refuses a write that got past the check.
#
# Executor time is the database's own number, without the client round trip. Compare runs only on the
# same machine, server version and data in one sitting. `digest` before and after a rewrite shows the
# two versions return the same rows (give the statements an ORDER BY that decides the order).

set -euo pipefail

usage() { sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; }

cmd=${1:-}
case "$cmd" in
    run | digest | compare) shift ;;
    -h | --help | "") usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
esac

project=""
container=""
database=custoro
runs=6

if [ "$cmd" != compare ]; then
    while getopts "p:c:d:n:" opt; do
        case "$opt" in
            p) project=$OPTARG ;;
            c) container=$OPTARG ;;
            d) database=$OPTARG ;;
            n) runs=$OPTARG ;;
            *) usage >&2; exit 2 ;;
        esac
    done
    shift $((OPTIND - 1))
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

if [ "$cmd" = compare ]; then
    [ $# -eq 2 ] || { usage >&2; exit 2; }
    awk -F'\t' '
        function ms(x) { return (x < 0.1) ? sprintf("%.3f", x) : sprintf("%.2f", x) }
        FNR == NR { before[$1] = $2; next }
        {
            if (!($1 in before)) next
            b = before[$1] + 0; a = $2 + 0
            change = (a > 0 && b > 0) ? (a <= b ? sprintf("%.1fx faster", b / a) : sprintf("%.1fx slower", a / b)) : ""
            printf "| %s | %s ms | %s ms | %s |\n", $1, ms(b), ms(a), change
        }
        BEGIN { print "| Statement | Before | After | Change |"; print "| --- | ---: | ---: | --- |" }
    ' "$1" "$2"
    exit 0
fi

[ $# -ge 1 ] || { usage >&2; exit 2; }
statements=$1
out=${2:-}
[ -f "$statements" ] || { echo "No such file: $statements" >&2; exit 2; }

repo=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)

if [ -z "$container" ]; then
    container=$(cd "$repo" && docker compose -p "${project:-custoro}" ps -q db)
    [ -n "$container" ] || { echo "No running db service in compose project ${project:-custoro}" >&2; exit 1; }
fi

# The client of whichever server this is, logged in as root through the socket
q() {
    docker exec -i "$container" sh -c \
        'c=$(command -v mariadb || command -v mysql); MYSQL_PWD="${MYSQL_ROOT_PASSWORD:-$MARIADB_ROOT_PASSWORD}" exec "$c" -uroot -N -B "$@"' sh "$@"
}

version=$(q -e 'SELECT VERSION()' </dev/null)
case "$version" in *aria*) maria=1 ;; *) maria=0 ;; esac

# Split the file into numbered statements: label.N and sql.N
awk -v dir="$work" '
    # 1 when a ";" stands outside quotes: a second statement on the same entry
    function extra_statement(s,    i, c, q, n) {
        n = length(s); q = ""
        for (i = 1; i <= n; i++) {
            c = substr(s, i, 1)
            if (q != "") {
                if (c == "\\") i++
                else if (c == q) { if (substr(s, i + 1, 1) == q) i++; else q = "" }
            } else if (c == "\047" || c == "\"" || c == "`") q = c
            else if (c == ";") return 1
        }
        return 0
    }
    # the first word that writes or reads files, found outside quotes (else "")
    function forbidden(s,    i, c, q, n, t, k, words, w) {
        n = length(s); q = ""; t = ""
        for (i = 1; i <= n; i++) {
            c = substr(s, i, 1)
            if (q != "") {
                if (c == "\\") i++
                else if (c == q) { if (substr(s, i + 1, 1) == q) i++; else q = "" }
                t = t " "
            } else if (c == "\047" || c == "\"" || c == "`") { q = c; t = t " " }
            else t = t c
        }
        gsub(/[^A-Za-z0-9_]+/, " ", t)
        t = " " toupper(t) " "
        split("INSERT UPDATE DELETE DROP ALTER TRUNCATE CREATE GRANT CALL LOAD OUTFILE DUMPFILE", words, " ")
        for (k = 1; k <= 11; k++) { w = words[k]; if (index(t, " " w " ")) return w }
        return ""
    }
    function flush(    word) {
        if (buf == "") return
        if (label == "") { print "Statement without a `-- name:` line: " buf > "/dev/stderr"; bad = 1; exit 2 }
        sub(/[ \t\r\n;]+$/, "", buf)
        if (toupper(buf) !~ /^(SELECT|WITH)[ \t\r\n(]/) { print "Only SELECT or WITH is run, not: " substr(buf, 1, 60) > "/dev/stderr"; bad = 1; exit 2 }
        if (extra_statement(buf)) { print "One statement per entry, but there is a \";\" inside: " substr(buf, 1, 60) > "/dev/stderr"; bad = 1; exit 2 }
        word = forbidden(buf)
        if (word != "") { print "Not read-only: " word " in " substr(buf, 1, 60) > "/dev/stderr"; bad = 1; exit 2 }
        n++
        print label > (dir "/label." n)
        print buf > (dir "/sql." n)
        close(dir "/label." n); close(dir "/sql." n)
        buf = ""; label = ""
    }
    /^-- name:/ { label = substr($0, 10); gsub(/^[ \t]+|[ \t\r]+$/, "", label); next }
    /^[ \t]*--/ { next }
    /^[ \t\r]*$/ { next }
    { buf = buf $0 "\n" }
    /;[ \t\r]*$/ { flush() }
    END { if (!bad) flush(); print n + 0 > (dir "/count") }
' "$statements"
count=$(cat "$work/count")
[ "$count" -gt 0 ] || { echo "No statements found in $statements" >&2; exit 2; }

if [ "$cmd" = digest ]; then
    printf '%s\n' "server: $version" >&2
    i=1
    while [ "$i" -le "$count" ]; do
        label=$(cat "$work/label.$i")
        # The result goes to a file: command substitution would drop trailing newlines, and zero rows
        # would look like one empty row
        if ! { printf 'SET SESSION TRANSACTION READ ONLY;\n'; cat "$work/sql.$i"; printf ';\n'; } |
            q -D "$database" >"$work/out.$i" 2>"$work/err"; then
            echo "The database refused: $label" >&2
            cat "$work/err" >&2
            exit 1
        fi
        printf '%-44s %7s rows  %s\n' "$label" "$(wc -l <"$work/out.$i" | tr -d ' ')" \
            "$(shasum -a 256 <"$work/out.$i" | cut -c1-12)"
        i=$((i + 1))
    done
    exit 0
fi

# One read-only session: a marker line, then the statement under ANALYZE, runs + 1 times
script="$work/script.sql"
printf 'SET SESSION TRANSACTION READ ONLY;\n' >"$script"
i=1
while [ "$i" -le "$count" ]; do
    printf "SELECT '@@ %s';\n" "$(sed "s/'/''/g" "$work/label.$i")" >>"$script"
    r=0
    while [ "$r" -le "$runs" ]; do
        if [ "$maria" = 1 ]; then printf 'ANALYZE FORMAT=JSON '; else printf 'EXPLAIN ANALYZE '; fi >>"$script"
        { cat "$work/sql.$i"; printf ';\n'; } >>"$script"
        r=$((r + 1))
    done
    i=$((i + 1))
done

if ! q -D "$database" <"$script" >"$work/raw" 2>"$work/err"; then
    echo "The database refused a statement:" >&2
    cat "$work/err" >&2
    exit 1
fi

awk -F'\n' -v maria="$maria" -v runs="$runs" '
    /^@@ / { label = substr($0, 4); labels[++L] = label; seen = 0; next }
    {
        seen++
        if (seen == 1) next                                  # warm-up run
        if (maria) {
            # a time before "query_block" belongs to the optimizer, the executor time comes after it
            i = index($0, "\"query_block\""); if (!i) next
            rest = substr($0, i)
            if (!match(rest, /"r_total_time_ms": *[0-9.eE+-]+/)) next
            v = substr(rest, RSTART, RLENGTH); sub(/^[^:]*: */, "", v)
        } else {
            # the server prints small times as 83e-6 and none as 0
            if (!match($0, /actual time=[0-9.eE+-]+\.\.[0-9.eE+-]+/)) next
            v = substr($0, RSTART, RLENGTH); sub(/^.*\.\./, "", v)
        }
        n[label]++; t[label, n[label]] = v + 0
    }
    END {
        for (k = 1; k <= L; k++) {
            label = labels[k]; c = n[label] + 0
            if (c == 0) { printf "%s\tn/a\tn/a\tn/a\t0\n", label; continue }
            for (a = 1; a <= c; a++) s[a] = t[label, a]
            for (a = 2; a <= c; a++) { x = s[a]; b = a - 1; while (b >= 1 && s[b] > x) { s[b + 1] = s[b]; b-- } s[b + 1] = x }
            median = (c % 2) ? s[(c + 1) / 2] : (s[c / 2] + s[c / 2 + 1]) / 2
            printf "%s\t%.3f\t%.3f\t%.3f\t%d\n", label, median, s[1], s[c], c
        }
    }
' "$work/raw" >"$work/result.tsv"

echo "Server: $version, database $database, median of $runs warm runs, executor time" >&2
echo "| Statement | Median | Min | Max |"
echo "| --- | ---: | ---: | ---: |"
awk -F'\t' '
    function ms(x) { return (x < 0.1) ? sprintf("%.3f", x) : sprintf("%.2f", x) }
    { if ($2 == "n/a") printf "| %s | n/a | n/a | n/a |\n", $1; else printf "| %s | %s ms | %s ms | %s ms |\n", $1, ms($2), ms($3), ms($4) }
' "$work/result.tsv"

if [ -n "$out" ]; then
    cp "$work/result.tsv" "$out"
    echo "Saved $out" >&2
fi
