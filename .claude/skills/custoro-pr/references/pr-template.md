# PR description template

The shape of PRs 5, 6 and 7 (`dooker/custoro`). Write the body to a file outside the repo, fill every section with real numbers, delete sections that do not apply (not "Why" or "Test plan"), and fill the commit hashes after the commits exist.

```markdown
## Summary

Fixes the findings of the <date> <kind> review of `main` (`<short sha>`), one commit each, each with its
own CHANGELOG entry. Checked against a local stack (<what was run>).

| Commit    | Change                                            |
| --------- | ------------------------------------------------- |
| `abc1234` | <one line: what now happens, not what was edited> |
| `def5678` | <...>                                             |

## Why

- **<Finding>:** <what happened, how it was reproduced, the exact error or wrong output>
- **<Finding>:** <...>

**Performance** (<N> invoices, MySQL 8.4, `EXPLAIN ANALYZE`, median of 6 warm runs):

| Query            | Before | After |
| ---------------- | -----: | ----: |
| Invoice list p.1 | 258 ms | ~1 ms |

<Say what could not be reproduced, and on which database a number was measured.>

## Decisions to review

- **<Choice>**: <what was chosen, the alternative, what it costs>
- **<Choice>**: <...>

## Deploy notes

- **Take a backup first** (`mysqldump --single-transaction`); the migrations cannot undo a structure change
- <migrations: which, what they stop on, how to run, what the database user needs>
- <new or required environment variables; existing setups that must add them>
- <which images to rebuild: API, web, both>

## Test plan

- [x] API: prettier, eslint, `tsc --noEmit`, <N> unit tests (<M> new)
- [x] Web: eslint (0 errors), `tsc --noEmit`, <N> unit tests
- [x] Playwright `api` project against the dev stack: <N> passed with `--workers=1`
- [x] The tests have teeth: with the old code put back, <which> fail
- [x] Checked by hand against the running API: <what, with the answer>
- [ ] Not done: <what was not run, and why>

## Not in this PR

<What was seen and left alone, one line each, so nobody has to rediscover it.>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Optional sections

- **Found while doing it**: problems beyond the brief, worst first, each with the consequence for deploy ("If main is already deployed with the 2026-10-19 migrations, deploy this").
- **Behaviour changes to know**: what a client or the web app sees differently.
- **Review round (Copilot)**: findings per round and how each was settled, with the commit.
- **Verification**: counts and the exact commands, when the Test plan would get too long.

## Style

- Numbers over adjectives: row counts, milliseconds, test counts, the server and version.
- Name what a reviewer has to decide, not only what was done.
- Public repo: no real emails, tokens, customer names or production hostnames.
