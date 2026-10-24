#!/usr/bin/env bash
# Times SELECT statements the way the 2026 database and query reviews did: every statement runs once
# to warm up, then N times under EXPLAIN ANALYZE (MySQL) or ANALYZE FORMAT=JSON (MariaDB); the
# table shows the median of the executor time. Needs Docker and a running MySQL or MariaDB container.
#
#   explain-bench.sh run        [target] [-n runs] <statements.sql> [out.tsv]
#   explain-bench.sh digest     [target] <statements.sql>      rows and a checksum of each result
#   explain-bench.sh compare    <before.tsv> <after.tsv>        the Before / After table for a PR
#   explain-bench.sh check      <statements.sql>                validate the file, no database needed
#   explain-bench.sh privileges [target]                        prove the benchmark user cannot write or read files
#   explain-bench.sh drop-users [target]                        drop explain_bench_* users that a killed run left behind
#
#   target:  -p <compose project> (its `db` service; default `custoro`) or -c <container>,
#            and -d <database> (default custoro, letters, digits and _ only). Setup and cleanup use root
#            with the container's MYSQL_ROOT_PASSWORD (MARIADB_ROOT_PASSWORD on MariaDB).
#   -n 6     timed runs per statement (after the warm-up run)
#
# statements.sql: `-- name: <label>` then one SELECT ending in `;`, see references/statements.example.sql.
# The statements really run, so the benchmark is fenced in layers, and layer 2 is the one that counts:
#   1. a scan of the file (the same as `check`): one SELECT or WITH per entry, no second statement, no
#      INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, CALL, LOAD, OUTFILE, DUMPFILE or
#      DELIMITER outside quotes, no backslash and no comment (`--`, `#`, `/*`) outside quotes. It catches
#      mistakes and the obvious, and refuses a bad file before anything runs, but it is a word list over
#      text and is not the security boundary
#   2. the statements run as a throwaway database user that has SELECT on the one database and nothing
#      else (no FILE, so no INTO OUTFILE, DUMPFILE or LOAD_FILE; no write, no stored routine, no
#      SET GLOBAL). It is created for the run with a random name and password, so overlapping runs
#      do not touch each other's, and dropped at the end. This is the boundary, enforced by the
#      server; `privileges` tests it
#   3. every session has a fixed SQL mode and is READ ONLY, and the client runs with --binary-mode so
#      it ignores its own backslash commands
#
# Executor time is the database's own number, without the client round trip. Compare runs only on the
# same machine, server version and data in one sitting. `digest` before and after a rewrite shows the
# two versions return the same rows (give the statements an ORDER BY that decides the order).

set -euo pipefail

usage() { sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; }

cmd=${1:-}
case "$cmd" in
    run | digest | compare | check | privileges | drop-users) shift ;;
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
    case "$runs" in '' | *[!0-9]* | 0) echo "-n must be a positive whole number" >&2; exit 2 ;; esac
    # the database name goes into GRANT: letters, digits and underscore only
    case "$database" in '' | *[!A-Za-z0-9_]*) echo "-d must be a database name of letters, digits and _" >&2; exit 2 ;; esac
fi

work=$(mktemp -d)
container=${container:-}
bench_user=""
bench_pw=""
made_sibling=""

# The client of whichever server this is. root_q logs in as root (setup, cleanup, version); bench_q as
# the throwaway user the statements run as. Both use the socket inside the container.
root_q() {
    docker exec -i "$container" sh -c \
        'c=$(command -v mariadb || command -v mysql); MYSQL_PWD="${MYSQL_ROOT_PASSWORD:-$MARIADB_ROOT_PASSWORD}" exec "$c" -uroot -N -B --binary-mode=1 "$@"' sh "$@"
}
bench_q() {
    docker exec -i -e MYSQL_PWD="$bench_pw" -e BENCH_USER="$bench_user" "$container" sh -c \
        'c=$(command -v mariadb || command -v mysql); exec "$c" -u"$BENCH_USER" -N -B --binary-mode=1 "$@"' sh "$@"
}

cleanup() {
    if [ -n "$bench_user" ]; then
        root_q -e "DROP USER IF EXISTS '$bench_user'@'localhost'; DROP USER IF EXISTS '${bench_user}_p'@'localhost'" </dev/null >/dev/null 2>&1 || true
    fi
    if [ -n "$made_sibling" ]; then
        root_q -e "DROP DATABASE IF EXISTS \`$made_sibling\`" </dev/null >/dev/null 2>&1 || true
    fi
    rm -rf "$work"
}
trap cleanup EXIT

resolve_container() {
    local repo
    if [ -z "$container" ]; then
        repo=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
        container=$(cd "$repo" && docker compose -p "${project:-custoro}" ps -q db)
        [ -n "$container" ] || { echo "No running db service in compose project ${project:-custoro}" >&2; exit 1; }
    fi
}

# A user with SELECT on the one database and nothing else. A random name and a random password every
# run, so overlapping runs on one container do not touch each other's account; the user is dropped at
# the end (`drop-users` removes what a killed run left). In a database-level GRANT an underscore is a
# wildcard, even inside backticks, so it is escaped: -d custoro_test must not open custoroXtest too.
create_bench_user() {
    local grant_db=${database//_/\\_}
    bench_user="explain_bench_$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
    bench_pw=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
    root_q -e "CREATE USER '$bench_user'@'localhost' IDENTIFIED BY '$bench_pw';
               GRANT SELECT ON \`$grant_db\`.* TO '$bench_user'@'localhost'" </dev/null
}

if [ "$cmd" = compare ]; then
    [ $# -eq 2 ] || { usage >&2; exit 2; }
    awk -F'\t' '
        function ms(x) { return (x < 0.1) ? sprintf("%.3f", x) : sprintf("%.2f", x) }
        FNR == NR { before[$1] = $2; next }
        function cell(x) { return (x == "n/a") ? "n/a" : ms(x + 0) " ms" }
        {
            if (!($1 in before)) next
            # a statement without a measured time stays n/a and gets no ratio
            b = before[$1]; a = $2
            change = (b != "n/a" && a != "n/a" && a + 0 > 0 && b + 0 > 0) ? ((a + 0) <= (b + 0) ? sprintf("%.1fx faster", b / a) : sprintf("%.1fx slower", a / b)) : ""
            printf "| %s | %s | %s | %s |\n", $1, cell(b), cell(a), change
        }
        BEGIN { print "| Statement | Before | After | Change |"; print "| --- | ---: | ---: | --- |" }
    ' "$1" "$2"
    exit 0
fi

if [ "$cmd" = drop-users ]; then
    resolve_container
    list=$(root_q -e "SELECT CONCAT('DROP USER IF EXISTS ', QUOTE(user), '@', QUOTE(host), ';') FROM mysql.user WHERE LEFT(user, 14) = 'explain_bench_' OR user = 'explain_bench'" </dev/null)
    if [ -z "$list" ]; then
        echo "No explain_bench users."
    else
        printf '%s\n' "$list" | root_q
        printf '%s user(s) dropped.\n' "$(printf '%s\n' "$list" | wc -l | tr -d ' ')"
    fi
    exit 0
fi

if [ "$cmd" = privileges ]; then
    resolve_container
    version=$(root_q -e 'SELECT VERSION()' </dev/null)
    create_bench_user
    printf 'Server: %s, database %s, user %s\n' "$version" "$database" "$bench_user"
    failed=0
    denied_re='denied|ERROR 1045|ERROR 1044|ERROR 1142|ERROR 1227|ERROR 1370|ERROR 1410'
    # try <name> <sql> <denied | the exact output expected>: every statement runs as the benchmark user,
    # without the session fences, so it is the privileges alone that are tested. The statements that
    # would do harm if the boundary were broken point at objects that do not exist.
    try() {
        local out
        out=$(bench_q -D "$database" -e "$2" 2>&1 </dev/null) || true
        if { [ "$3" = denied ] && printf '%s' "$out" | grep -qiE "$denied_re"; } || [ "$out" = "$3" ]; then
            printf '  ok    %s\n' "$1"
        else
            printf '  FAIL  %s: %s\n' "$1" "$(printf '%s' "$out" | head -1 | cut -c1-110)"
            failed=1
        fi
    }
    try "SELECT works" "SELECT 1" "1"
    try "INTO OUTFILE is denied" "SELECT 'x' INTO OUTFILE '/tmp/explain-bench-privileges'" denied
    try "INTO DUMPFILE is denied" "SELECT 'x' INTO DUMPFILE '/tmp/explain-bench-privileges'" denied
    try "LOAD_FILE reads nothing" "SELECT LOAD_FILE('/etc/passwd') IS NULL" "1"
    try "INSERT is denied" "INSERT INTO \`$database\`.explain_bench_probe VALUES (1)" denied
    try "UPDATE is denied" "UPDATE \`$database\`.explain_bench_probe SET id = 1" denied
    try "DELETE is denied" "DELETE FROM \`$database\`.explain_bench_probe" denied
    try "CREATE TABLE is denied" "CREATE TABLE \`$database\`.explain_bench_probe (id INT)" denied
    try "DROP TABLE is denied" "DROP TABLE IF EXISTS \`$database\`.explain_bench_probe" denied
    try "CREATE USER is denied" "CREATE USER '${bench_user}_p'@'localhost'" denied
    try "GRANT is denied" "GRANT ALL ON *.* TO '$bench_user'@'localhost'" denied
    try "SET GLOBAL is denied" "SET GLOBAL sql_mode = @@GLOBAL.sql_mode" denied
    try "the mysql schema is closed" "SELECT * FROM mysql.user LIMIT 1" denied
    # a database that an unescaped underscore in the grant would also open (custoro_test and custoroXtest)
    sibling=${database//_/X}
    if [ "$sibling" != "$database" ]; then
        if [ "$(root_q -e "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = '$sibling'" </dev/null)" = 0 ]; then
            root_q -e "CREATE DATABASE \`$sibling\`" </dev/null
            made_sibling=$sibling
        fi
        try "a sibling database ($sibling) is closed" "SELECT 1 FROM \`$sibling\`.explain_bench_probe" denied
    fi
    grants=$(bench_q -e "SHOW GRANTS" 2>&1 </dev/null || true)
    if printf '%s' "$grants" | grep -q "GRANT SELECT ON" && ! printf '%s' "$grants" | grep -qE 'FILE|ALL PRIVILEGES|GRANT OPTION|SUPER|INSERT|UPDATE|DELETE'; then
        printf '  ok    SHOW GRANTS lists SELECT on %s and nothing else\n' "$database"
    else
        printf '  FAIL  SHOW GRANTS lists more than SELECT on %s\n' "$database"
        failed=1
    fi
    [ "$failed" -eq 0 ] && echo "The benchmark user can only read $database." || echo "The benchmark user can do more than read." >&2
    exit "$failed"
fi

[ $# -ge 1 ] || { usage >&2; exit 2; }
statements=$1
out=${2:-}
[ -f "$statements" ] || { echo "No such file: $statements" >&2; exit 2; }

# Split the file into numbered statements: label.N and sql.N
awk -v dir="$work" '
    # 1 when a comment starts outside quotes: "--", "#" or "/*". Comments are refused, not skipped,
    # because a quote inside one (`/* \047 */`) would make the scans below read the rest as a string
    function comment_marker(s,    i, c, d, q, n) {
        n = length(s); q = ""
        for (i = 1; i <= n; i++) {
            c = substr(s, i, 1); d = substr(s, i + 1, 1)
            if (q != "") {
                if (c == "\\" && q != "`") i++
                else if (c == q) { if (d == q) i++; else q = "" }
            } else if (c == "\047" || c == "\"" || c == "`") q = c
            else if (c == "#" || (c == "-" && d == "-") || (c == "/" && d == "*")) return 1
        }
        return 0
    }
    # 1 when a backslash stands outside quotes: the mysql client reads "\\!" (shell command), "\\." (source a
    # file), "\\C" (character set) and others from the text before the server sees it
    function client_command(s,    i, c, q, n) {
        n = length(s); q = ""
        for (i = 1; i <= n; i++) {
            c = substr(s, i, 1)
            if (q != "") {
                if (c == "\\" && q != "`") i++
                else if (c == q) { if (substr(s, i + 1, 1) == q) i++; else q = "" }
            } else if (c == "\047" || c == "\"" || c == "`") q = c
            else if (c == "\\") return 1
        }
        return 0
    }
    # 1 when a ";" stands outside quotes: a second statement on the same entry
    function extra_statement(s,    i, c, q, n) {
        n = length(s); q = ""
        for (i = 1; i <= n; i++) {
            c = substr(s, i, 1)
            if (q != "") {
                if (c == "\\" && q != "`") i++
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
                if (c == "\\" && q != "`") i++
                else if (c == q) { if (substr(s, i + 1, 1) == q) i++; else q = "" }
                t = t " "
            } else if (c == "\047" || c == "\"" || c == "`") { q = c; t = t " " }
            else t = t c
        }
        gsub(/[^A-Za-z0-9_]+/, " ", t)
        t = " " toupper(t) " "
        n = split("INSERT UPDATE DELETE DROP ALTER TRUNCATE CREATE GRANT CALL LOAD OUTFILE DUMPFILE DELIMITER", words, " ")
        for (k = 1; k <= n; k++) { w = words[k]; if (index(t, " " w " ")) return w }
        return ""
    }
    function flush(    word) {
        if (buf == "") return
        if (label == "") { print "Statement without a `-- name:` line: " buf > "/dev/stderr"; bad = 1; exit 2 }
        sub(/[ \t\r\n;]+$/, "", buf)
        sub(/^[ \t\r\n]+/, "", buf)                        # the SQL templates of the API are indented
        if (toupper(buf) !~ /^(SELECT|WITH)[ \t\r\n(]/) { print "Only SELECT or WITH is run, not: " substr(buf, 1, 60) > "/dev/stderr"; bad = 1; exit 2 }
        if (comment_marker(buf)) { print "Comments (--, #, /*) are not accepted inside a statement: " substr(buf, 1, 60) > "/dev/stderr"; bad = 1; exit 2 }
        if (client_command(buf)) { print "A backslash outside quotes is a client command (\\!, \\., \\C ...), not accepted: " substr(buf, 1, 60) > "/dev/stderr"; bad = 1; exit 2 }
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

if [ "$cmd" = check ]; then
    echo "ok: $count statement(s), each one read-only SELECT or WITH"
    exit 0
fi

resolve_container
version=$(root_q -e 'SELECT VERSION()' </dev/null)
case "$version" in *aria*) maria=1 ;; *) maria=0 ;; esac
create_bench_user
# From here on every statement runs as the benchmark user
q() { bench_q "$@"; }

# Every session starts from the same SQL mode, so quotes and backslashes mean what the scan assumes
# whatever the server default is (NO_BACKSLASH_ESCAPES, ANSI_QUOTES, ORACLE ... change how a statement
# is read), and refuses writes. Timings are not affected by the mode.
session_setup="SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'; SET SESSION TRANSACTION READ ONLY;"

if [ "$cmd" = digest ]; then
    printf '%s\n' "server: $version" >&2
    i=1
    while [ "$i" -le "$count" ]; do
        label=$(cat "$work/label.$i")
        # The result goes to a file: command substitution would drop trailing newlines, and zero rows
        # would look like one empty row
        if ! { printf '%s\n' "$session_setup"; cat "$work/sql.$i"; printf ';\n'; } |
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
printf '%s\n' "$session_setup" >"$script"
i=1
while [ "$i" -le "$count" ]; do
    # The marker is the entry's number: a label is text from the file and never goes into SQL
    printf "SELECT '@@ %d';\n" "$i" >>"$script"
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

i=1
: >"$work/labels.txt"
while [ "$i" -le "$count" ]; do
    cat "$work/label.$i" >>"$work/labels.txt"
    i=$((i + 1))
done

awk -F'\n' -v maria="$maria" -v runs="$runs" '
    FNR == NR { names[FNR] = $0; next }
    /^@@ / { label = names[substr($0, 4) + 0]; labels[++L] = label; seen = 0; next }
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
' "$work/labels.txt" "$work/raw" >"$work/result.tsv"

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
