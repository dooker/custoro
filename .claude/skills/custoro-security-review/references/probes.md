# Probes: run these, compare with the right-hand side

All answered as shown on the dev stack (2026-10-24, current `main`). Base setup:

```bash
API=http://localhost:3999
login() { curl -s -X POST $API/login -H 'Content-Type: application/json' \
  -d "{\"username\":\"$1\",\"password\":\"$2\"}" | jq -r .token; }
ADMIN=$(login <admin email> '<admin password>')    # logins: apps/api/db/demo/demo-logins.md
USER_TOKEN=$(login <regular email> '<regular password>')
H="Authorization: Bearer $ADMIN"; J='Content-Type: application/json'
```

## Authorization

| Probe                                                                                         | Correct answer                                  |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `curl -s -w ' %{http_code}' $API/customers/`                                                  | `{"success":false,"message":"auth.header"}` 401 |
| `-H 'Authorization: Bearer x.y.z'` on any route                                               | `invalid.token`, HTTP 200                       |
| regular user: `GET /users/`, `PUT /settings/`, `GET /search/?resource=users&keyword=a&page=1` | `{"success":false,"message":"forbidden"}` 403   |
| a token after the password was changed (PUT `/profile/`) or the user deleted                  | `invalid.token`                                 |

Run every row of `scripts/route-table.mjs` that is admin-only as the regular user, and every route without a token. A 200 with data is a finding.

## Hostile input

```bash
for p in '1%20OR%201=1' '1;DROP%20TABLE%20users' '1e3' '0' '99999999999' '-1'; do
  curl -s "$API/customer/$p" -H "$H"; echo; done                  # each: {"success":false,"message":"error"}
curl -s -X POST $API/customer/ -H "$H" -H "$J" -d '{"name":{"a":1}}'     # invalidInput (also ["x"])
curl -s -w ' %{http_code}\n' -X POST $API/customer/ -H "$H" -H "$J" -d '{bad json'   # Bad Request 400
head -c 200000 /dev/zero | tr '\0' a | jq -Rs '{name: .}' | \
  curl -s -w ' %{http_code}\n' -X POST $API/customer/ -H "$H" -H "$J" --data-binary @-   # Payload Too Large 413
KW=$(python3 -c "print('%20'.join('zz%d' % i for i in range(1000)))")
curl -s -o /dev/null -w '%{time_total}s\n' "$API/customers/1/name/ASC?keyword=$KW" -H "$H"   # milliseconds, 8 words used
curl -s -o /dev/null -w '%{time_total}s\n' "$API/customers/1/id%20DESC,(SELECT%20SLEEP(5))/ASC" -H "$H"   # instant: order falls back to name
curl -s "$API/customers/1?page=0&limit=1000000" -H "$H" | jq '.resource | length'          # at most 50 (1000 without page and limit)
```

Time-based probes (`SLEEP`) are the cheap way to show an injection: a response that takes five seconds is a finding. Use the same on every parameter that reaches SQL (`keyword`, `order`, `direction`, `customer`, `:page`).

## Uploads

`curl -s -X PUT $API/profile/ -H "$H" -F 'avatar=@x.png;type=image/png' -F name=Admin`, where `x.png` holds HTML, answers `{"success":false,"message":"uploadType"}` (the signature check). An SVG with a script is refused the same way, a file over 5 MB with `uploadSize`. `curl -s -o /dev/null -w '%{http_code}' $API/uploads/` is 404 (no folder listing). The existing cases are in `apps/web/tests/uploads.api.spec.ts`.

## Races

```bash
E="race-$RANDOM@example.test"
seq 10 | xargs -P 10 -I{} curl -s -w '\n' -X POST $API/user/ -H "$H" -H "$J" \
  -d "{\"username\":\"$E\",\"name\":\"Race\",\"role\":\"user\"}" | sort | uniq -c
# 1 {"success":true,"insertId":N}   9 {"success":false,"message":"user.exists"}
```

For invoices, run the pattern of `apps/web/tests/invoice-numbers.api.spec.ts` (parallel creation, numbers must be unique and consecutive) or a Playwright script with `Promise.all`. Clean up: the API cannot delete invoices, so races on invoices belong on a scratch database.

## Rate limits

```bash
for i in $(seq 12); do curl -s -o /dev/null -w '%{http_code} ' -X POST $API/login -H "$J" \
  -d '{"username":"<regular email>","password":"wrong"}'; done        # 200 x10, then 429 429
curl -s -i -X POST $API/login -H "$J" -d '{"username":"<REGULAR EMAIL IN CAPITALS>","password":"wrong"}' | grep -i -E 'HTTP/|retry-after'
# 429, Retry-After: 900: another spelling of the same email shares the budget
```

This locks that account for 15 minutes (until the API restarts). Use a throwaway user. The dev compose raises the per-address limit (`LOGIN_MAX_FAILURES_PER_IP=500`), so test the per-address limit with the production settings.

## Query digests

MySQL 8.4 (`performance_schema` is on):

```sql
TRUNCATE performance_schema.events_statements_summary_by_digest;
-- run the probes, the list pages, the searches ...
SELECT LEFT(DIGEST_TEXT, 70) AS statement, COUNT_STAR AS calls,
       ROUND(SUM_TIMER_WAIT/1e9, 1) AS total_ms, ROUND(AVG_TIMER_WAIT/1e9, 2) AS avg_ms,
       SUM_ROWS_EXAMINED AS examined, SUM_ROWS_SENT AS sent, SUM_NO_INDEX_USED AS no_index
FROM performance_schema.events_statements_summary_by_digest
WHERE SCHEMA_NAME = 'custoro' AND DIGEST_TEXT NOT LIKE '%events_statements_summary_by_digest%'
ORDER BY SUM_TIMER_WAIT DESC LIMIT 10;
```

Run it with `docker compose -p custoro-audit exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" custoro'`. A statement that examines far more rows than it sends (`examined` vs `sent`) or has `no_index` > 0 on a big table is the lead. Follow up with `EXPLAIN ANALYZE <statement>`.

MariaDB 11.4 (`performance_schema` is OFF by default): log every statement to a table, run the probes in new connections, read the table.

```sql
SET GLOBAL log_output = 'TABLE'; SET GLOBAL slow_query_log = 1; SET GLOBAL long_query_time = 0;
TRUNCATE mysql.slow_log;
-- new connections only: run the probes
SELECT query_time, rows_examined, rows_sent, LEFT(CONVERT(sql_text USING utf8mb4), 70) AS stmt
FROM mysql.slow_log ORDER BY query_time DESC LIMIT 10;
SET GLOBAL slow_query_log = 0; SET GLOBAL long_query_time = 10;
```
