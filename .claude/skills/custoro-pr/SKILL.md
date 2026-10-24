---
name: custoro-pr
description: Commit and open a pull request for Custoro in the repo's usual format: one commit per theme with the Co-Authored-By trailer, a CHANGELOG entry under Unreleased, the PR description (Summary table, Why with measurements, Decisions to review, Deploy notes, Test plan with checkboxes, Not in this PR), the CI checks, and answers to Copilot review comments. Use when asked to "commit this", "open a PR", "write the PR description", "split this into commits", "add a changelog entry", "why did CI fail", "the docker job failed", or "handle the Copilot review".
---

# Custoro commits and pull requests

The repo is `dooker/custoro`, default branch `main`, PRs are squash-merged (the commit messages of the branch end up in the squash body, so write them to be read). Reviewers read commit by commit: **one commit per theme**, each one reviewable and passing on its own.

## Commits

- Branch off `main` (`fix/<topic>`, `chore/<topic>`). Never commit to `main`.
- Add files by path (`git add <paths>`), never `git add -A`: `.claude/settings.local.json` and `.claude/worktrees` must stay out.
- Subject: one sentence in the imperative, no prefix, about 70 characters ("Require TRUST_PROXY in production so a forged X-Forwarded-For is not believed"). Body: the symptom and how it was found (with numbers), then bullets for what changed, then what was tested ("checked against the running API"). Wrap at about 76.
- End every message with the trailer the session gives for attribution, for example `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, after a blank line.
- Each commit brings its tests and its `CHANGELOG.md` entry. When the entries are small, the last commit may carry them all (PR 6 did).
- Run the checks below before the commit, on the files you changed at least.

## CHANGELOG

`CHANGELOG.md` has one `## Unreleased` section with `### Added`, `### Security`, `### Fixed`, `### Changed`. One bullet per change, wrapped at 100 columns with a 2-space hanging indent, written for someone running the app, not for the diff: what was wrong, what happens now, and what they must do. A change with a deploy step says so in bold, as the existing entries do: **Existing databases must run the new migration**, **Existing production setups must add `TRUST_PROXY` to `.env`**. The web app shows this file, so keep it plain Markdown.

## Checks (what CI runs, `.github/workflows/ci.yml`)

| Job      | Steps (in order)                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `api`    | in `apps/api`: `npm ci`, `npx prettier --check .`, `npx eslint .`, `npm run type-check`, `npx vitest run`, `npm run build`                             |
| `web`    | in `apps/web`: `npm ci`, `npx prettier --check "src/**/*.{ts,tsx,css,md}"`, `npm run lint`, `npm run type-check`, `npx vitest run`, `npm run build`    |
| `docker` | `docker compose -f docker-compose.prod.yml build` with `DB_ROOT_PASSWORD`, `DB_USERNAME`, `DB_PASSWORD`, `APP_ORIGIN`, `JWT_SECRET`, `TRUST_PROXY` set |

Playwright is not run in CI; run the `api` project yourself. Run the checks in containers on this machine (host Node 22): see `custoro-dev-stack` (`references/containers.md`). The web lint has about 30 old warnings and must have 0 errors.

**The docker job needs every variable the prod compose file requires.** `docker-compose.prod.yml` uses `${VAR:?message}` for variables with no safe default; CI sets dummy values under `env:` of the `docker` job. A new required variable that is missing there fails the job (PR 5 broke it with `TRUST_PROXY`). When you add one to the compose file, add it to `ci.yml` in the same commit. Reproduce without building:

```bash
DB_ROOT_PASSWORD=ci DB_USERNAME=ci DB_PASSWORD=ci APP_ORIGIN=http://localhost JWT_SECRET=ci TRUST_PROXY=1 \
  docker compose -f docker-compose.prod.yml config -q     # exit 0; without TRUST_PROXY: "required variable ... is missing"
```

## The pull request

Title: the theme and a list of what it fixes, no prefix ("Database review fixes: indexes, foreign keys, DECIMAL money, all-or-nothing invoices"). Body from [references/pr-template.md](references/pr-template.md), written to a file outside the repo and passed with `--body-file`:

```bash
git push -u origin <branch>
gh pr create --repo dooker/custoro --base main --head <branch> --title "<title>" --body-file <file>
```

Sections, in order:

1. **Summary**: what was reviewed or asked and at which commit, then a table `Commit | Change` with the short hashes.
2. **Why**: what was broken, found by what, with measurements: row counts, `EXPLAIN ANALYZE` times before and after, which server. Say when a claim could not be reproduced.
3. **Decisions to review**: each choice a reviewer might disagree with, bold lead, the alternative and the consequence.
4. **Deploy notes**: backup, migrations, new or required environment variables, which images to rebuild, what stops working for old clients.
5. **Test plan**: checkboxes with counts (`[x] API: prettier, eslint, tsc, 508 unit tests (12 new)`). **Say what was not done** as an unchecked box (`[ ] Not done: the Chromium suites, a run against production data`). Never tick what was not run.
6. **Not in this PR**: what was seen and left alone.

Optional, as in PRs 6 and 7: **Found while doing it** (problems beyond the brief, worst first, with the deploy consequence), **Behaviour changes to know**, **Review round (Copilot)**. End with the line the session gives for PR descriptions (`🤖 Generated with [Claude Code](https://claude.com/claude-code)`).

CI results: `gh pr checks <n> --repo dooker/custoro` once when asked; do not poll.

## Copilot review comments

Copilot reviews each push: an overview comment ("Changes recommended" or "Needs a closer look", with the open issues) and inline comments. PR 7 went through five rounds with 13 findings. Handle them like this, and only when the user asks you to answer the review, since replies are public comments:

1. Read everything: `gh api repos/dooker/custoro/pulls/<n>/comments --paginate` (inline) and `gh api repos/dooker/custoro/pulls/<n>/reviews` (overviews).
2. Treat each finding as a claim. Reproduce it or read the code first. A right finding gets a **new commit** (no amend, no force-push, so the reply can name the SHA) with a test that fails on the old code. A wrong one gets no change and a reply with the evidence.
3. Reply in the thread: `gh api -X POST repos/dooker/custoro/pulls/<n>/comments/<comment id>/replies -f body="Fixed in <sha>: <what changed and which test covers it>"`. Findings that came only in an overview (no thread) get one PR comment listing each point and its SHA: `gh pr comment <n> --repo dooker/custoro --body-file <file>`.
4. Push, wait for the next round, repeat until it says no open issues. What it marks "needs a closer look" (concurrency, MySQL and MariaDB differences) is for a human: say so in the PR.
5. Add a "Review round (Copilot)" section to the description: findings per round, all fixed or why not.
