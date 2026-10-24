#!/usr/bin/env bash
# Tests the statement guard of explain-bench.sh without a database: every word of its denylist (read
# from the script itself, so a new word is tested the moment it is added) must be refused, and a set of
# hostile and harmless statements must be refused or accepted as written below.
#
#   scripts/selftest.sh        prints one line per failure and a count; exit status 1 on any failure
#
# Run it after every change to the guard. It cannot show that a label stays out of the SQL (that needs
# a database: run `explain-bench.sh run` on a file whose label is  \'; DELETE ...; #  and check that
# nothing was deleted), but it shows that such a label is accepted as plain text.

set -uo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
bench="$here/explain-bench.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
pass=0
failed=0

# refuse|accept <expected text of the message, or "" for accept> <statement> [label]
expect() {
    local want=$1 text=$2 label=${3:-t} out
    printf -- '-- name: %s\n%s\n' "$label" "$text" >"$work/case.sql"
    if out=$("$bench" check "$work/case.sql" 2>&1); then
        if [ -z "$want" ]; then pass=$((pass + 1)); else failed=$((failed + 1)); printf 'FAIL accepted, expected "%s": %s\n' "$want" "$text"; fi
    else
        if [ -n "$want" ] && printf '%s' "$out" | grep -qF "$want"; then pass=$((pass + 1))
        else failed=$((failed + 1)); printf 'FAIL refused with "%s", expected "%s": %s\n' "$(printf '%s' "$out" | head -1)" "${want:-accept}" "$text"; fi
    fi
}

# Every denylist word, in the middle of a statement
words=$(grep -o 'split("[A-Z ]*"' "$bench" | sed -e 's/split("//' -e 's/"$//')
[ -n "$words" ] || { echo "FAIL could not read the denylist from explain-bench.sh"; exit 1; }
for word in $words; do
    expect "Not read-only: $word" "SELECT 1 $word 2;"
    expect "Not read-only: $word" "SELECT 1 $(printf '%s' "$word" | tr 'A-Z' 'a-z') 2;"
done

# Refused
expect "One statement per entry" "SELECT 1; DELETE FROM invoices;"
expect "One statement per entry" "SELECT 1;SELECT 2;"
expect "Not read-only: DELETE" "WITH x AS (SELECT 1) DELETE FROM invoices;"
expect "Only SELECT or WITH" "DELETE FROM invoices;"
expect "Only SELECT or WITH" "SHOW TABLES;"
expect "Not read-only: OUTFILE" "SELECT 'x' INTO OUTFILE '/tmp/x';"
expect "Not read-only: DUMPFILE" "SELECT 'x' INTO DUMPFILE '/tmp/x';"
printf 'SELECT 1;\n' >"$work/noname.sql"
if "$bench" check "$work/noname.sql" >/dev/null 2>&1; then failed=$((failed + 1)); echo "FAIL accepted a statement without a -- name: line"; else pass=$((pass + 1)); fi

# Refused: a comment hides what follows from a scan that reads quotes (the review of PR 8, round 4)
expect "Comments" "SELECT 'benchmark-check' /* ' */ INTO OUTFILE '/tmp/x' -- '"
expect "Comments" "SELECT 1 # '"
expect "Comments" "SELECT 1 -- '"
expect "Comments" "SELECT 1 /*! INTO OUTFILE '/tmp/x' */"
expect "Comments" "SELECT 1 /*!50000 INTO OUTFILE '/tmp/x' */"
expect "Comments" "SELECT 1 INTO/**/OUTFILE '/tmp/x'"
expect "Comments" "SELECT 1 /* ordinary */"
expect "Comments" "SELECT 1 FROM t WHERE a = 1 --"
printf -- "-- name: t\nSELECT 'x' # '\nINTO OUTFILE '/tmp/x'\n;\n" >"$work/multi.sql"
if "$bench" check "$work/multi.sql" >/dev/null 2>&1; then failed=$((failed + 1)); echo "FAIL accepted a # comment that hides OUTFILE on the next line"; else pass=$((pass + 1)); fi

# Accepted: the same characters and words inside quotes or as names are text
expect "" "SELECT 'a;b' AS x;"
expect "" "SELECT 'delete outfile dumpfile; drop' AS x;"
expect "" 'SELECT "q;delete" AS x;'
expect "" "SELECT 'it''s; fine' AS x;"
expect "" "SELECT 'a\\';b' AS x;"
expect "" "SELECT '-- not a comment', '# nor this', '/* nor this */' AS x;"
expect "" 'SELECT "-- no", `a#b` FROM t;'
expect "" 'SELECT `update` FROM `drop`;'
expect "" "SELECT LOAD_FILE_NAME, created_at FROM t;"
expect "" "WITH x AS (SELECT 1 AS a) SELECT a FROM x;"
expect "" "SELECT 1;" "\\'; DROP TABLE x; #"
expect "" "SELECT 1;" "a label with 'quotes', \"double\" and a backslash \\"

printf '%d passed, %d failed\n' "$pass" "$failed"
[ "$failed" -eq 0 ]
