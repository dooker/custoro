---
name: custoro-pr-review
description: Handle the review comments on a Custoro pull request, from Copilot or a person - read every thread and overview, verify each finding by reproducing it, fix the real ones in one commit each with a test that fails on the old code, run the checks, push, reply in each thread with the fixing commit, resolve every fixed thread, and record the round in the PR description. Use when asked to "check the Copilot comments", "handle the review", "fix the review comments", "answer the review", "reply to Copilot", "resolve the threads", or when a PR has new review comments.
---

# Custoro PR review

Facts: Copilot reviews every push to a PR. Its overview review says "Changes recommended" or "Needs a closer look" and lists the open issues, each linking to an inline thread; PR 7 took five rounds (13 findings), PR 24 one round of five. Replies and resolved threads are public: write facts, no scratch paths, no secrets. Commits, checks and the PR description itself follow `custoro-pr`.

`scripts/threads.sh` (in this skill) lists a PR's threads with their ids and resolves them:

```bash
S=.claude/skills/custoro-pr-review/scripts
$S/threads.sh list <pr> --open      # PRRT_... id | open | outdated | file:line | comment <id> by <who> | replied? | title
$S/threads.sh resolve PRRT_a PRRT_b # marks them resolved
```

## 1. Read everything

```bash
# Copilot's latest overview, with the commit it reviewed. Not just the last review: every reply in a
# thread is a review too (empty body), and a push without a new overview has not been reviewed yet.
gh api repos/dooker/custoro/pulls/<pr>/reviews \
  --jq '[.[] | select(.user.login | startswith("copilot"))] | last | "on \(.commit_id[0:7]):\n\(.body)"'
.claude/skills/custoro-pr-review/scripts/threads.sh list <pr> --open        # the open threads
gh api repos/dooker/custoro/pulls/<pr>/comments --paginate \
  --jq '.[] | select(.in_reply_to_id == null) | "=== \(.id) \(.path):\(.line // .original_line)\n\(.body)\n"'
gh pr view <pr> --repo dooker/custoro --comments                            # people's comments on the PR
```

List them with their severity before changing anything, and send that list to the user early.

## 2. Verify each finding

A finding is a claim. Read the code and reproduce it: a unit test that shows the wrong result, a run against the dev stack, the app in the browser for anything a user sees. Then it is one of:

- **Real**: write the test first and watch it fail on the current code. That test goes into the fix.
- **Wrong**: no change. The reply gives the evidence (the line that prevents it, the test that covers it, the output of a run).
- **Real but not for this PR**: say so in the reply and in "Not in this PR" of the description; leave the thread open for the owner.

What Copilot marks "needs a closer look" (concurrency, MySQL vs MariaDB) is for a human as well: verify what you can and say what you could not.

## 3. Fix, one commit per finding

- A **new commit** per finding on the PR branch: no amend, no rebase, no force-push, so the reply can name a SHA that stays.
- The message says where it came from and what was wrong, then what changed and which test covers it: `Copilot review of PR <pr> (high): <the symptom, with Copilot's example>`. Trailer as in `custoro-pr`.
- Every commit passes the checks on its own (`custoro-pr`, "Checks"). A fix the user sees (a form, a page) is also checked in the running app (`custoro-dev-stack`, the browser), not only by a unit test.
- Changed behaviour that the PR description or a CHANGELOG entry states gets updated in the same commit.

## 4. Check, then push

The checks of every app the fixes touched, the script tests (`npm run test:scripts`) when `scripts/` changed, and the Playwright `api` project against the dev stack when the API changed. Then `git push` (never `--force`).

## 5. Reply in each thread, then resolve it

Reply only after the push, so the SHA links work, and use the full SHA:

```bash
gh api -X POST repos/dooker/custoro/pulls/<pr>/comments/<first comment id>/replies \
  -f body='Fixed in <full sha>. Confirmed: <what happened>. Now <what changed>. Covered by `<test name>` in `<file>`, which fails on the old code.'
```

- A wrong finding: `Not changed: <evidence>.`
- A finding that came only in an overview, without a thread: one PR comment that lists each with its SHA (`gh pr comment <pr> --repo dooker/custoro --body-file <file>`).

**Every thread whose finding is fixed and pushed is resolved, always**, right after its reply:

```bash
.claude/skills/custoro-pr-review/scripts/threads.sh resolve <PRRT_ id> ...
.claude/skills/custoro-pr-review/scripts/threads.sh list <pr> --open      # only the ones left for a person
```

A thread stays open only when it was not fixed: a disputed finding (the reviewer or the owner decides) or one left for later. Say which ones and why.

## 6. Record the round

Add or extend "Review round (Copilot)" in the PR description (before "Not in this PR"), with `gh pr edit <pr> --repo dooker/custoro --body-file <file>`:

```markdown
## Review round (Copilot)

Round 1 (on `<sha reviewed>`): 5 findings, all confirmed and fixed, each in its own commit with a test that fails on the old code:

| Severity | Finding    | Fixed in  |
| -------- | ---------- | --------- |
| High     | <one line> | `83ed225` |

After the fixes: <the checks and their counts>.
```

Rows for wrong or deferred findings say "not changed: <why>". Update "Decisions to review" when a fix changed a decision.

## 7. The next round

Copilot reviews the new push. When its next overview arrives, go through this again, until it reports no open issues. Report to the user: findings per round, what was fixed in which commit, what was left open and why, and that every fixed thread is resolved.
