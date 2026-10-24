# Report template

Keep the report in the order below. Write it for someone who has not seen the session. A repo is public: no real tokens, passwords or customer data in it.

```markdown
# Security review of <area>, <date>

Reviewed `<commit>` on <MySQL 8.4 / MariaDB 11.4>, <database: demo or N-invoice synthetic>, API from <compose project>.
No code was changed.

## Summary

<Two or three sentences: how many findings per severity and the one thing to fix first.>

| #   | Severity | Finding    | Evidence            |
| --- | -------- | ---------- | ------------------- |
| 1   | High     | <one line> | Verified by running |
| 2   | Medium   | <one line> | Read from code      |

## Findings

### 1. <Title> (High)

**Evidence: verified by running.** `<exact command>` answered `<what came back>`; expected `<what a correct API gives>`.
**Where:** `apps/api/services/x.ts:123`
**Impact:** <who can do what to whom, with which precondition>.
**Fix (not applied):** <the smallest change that closes it, and what test would pin it>.

### 2. <Title> (Medium)

**Evidence: read from code**, not run because <reason>. `apps/api/...:45` ...

## Checked, no finding

- <area>: <how it was checked, e.g. 6 hostile ids on /customer/:id all refused>

## Not checked

- <what and why: production TLS to the database, a real SMTP server, the browser UI ...>
```

## Severity, highest first

- **Critical**: unauthenticated access to data or accounts, remote code execution, SQL injection.
- **High**: a logged-in low-privilege user reaches admin functions or other people's data; account takeover; credentials or tokens leak.
- **Medium**: abuse needs a precondition or limited reach (rate limit sidestep, denial of service by one request, data corruption without a security effect).
- **Low**: hardening, defense in depth, information leaks without a path to harm.
- **Info**: observations, including things done well.

A finding that was found while looking at something else is labeled as such. A finding already listed as open in `known-open.md` says so and gives the code check that confirmed it is still open.
