---
name: custoro-branch
description: Create, name, rename, update and clean up git branches for Custoro. Use when asked to "start a new branch", "create a branch for this", "name this branch", "rename the branch", "branch off main", "sync with main", "update my branch", "compare with main", "delete the merged branch", or when a session's auto-named worktree branch (claude/...) must become a PR branch.
---

# Custoro branches

Facts: the default branch is `main`, PRs are squash-merged, and every PR so far (1 to 8) was based on `main`. One branch is one PR. Never commit to `main`, never push to it, never force-push a branch that is under review (replies to review comments name commit SHAs, see `custoro-pr`).

## Name

`<prefix>/<topic>` in lowercase kebab-case:

| Prefix   | For                                                                    | Examples from the history                            |
| -------- | ---------------------------------------------------------------------- | ---------------------------------------------------- |
| `fix/`   | bugs, security and review findings, performance                        | `fix/api-security-review`, `fix/db-review-followups` |
| `chore/` | dependencies, tooling, docs and agent files, anything users do not see | `chore/major-upgrades`, `chore/agent-skills`         |

- The topic says what the PR is about in two to four words. Add a date only for a review of a given day (`fix/query-review-2026-10-21`). No ticket numbers (there are none), no author names, no second slash.
- There is no `feat/` branch yet. A new feature would follow the same pattern; say so when it is the first one.
- A session's worktree starts on an auto name such as `claude/eloquent-perlman-6ba8db`. That is a working name: rename it before the first push.

## Create

Branch from `origin/main` after a fetch, **not from the local `main`**: the local `main` of the main checkout can be behind (it was on `ca444ac` while `origin/main` was `dbdeeda`).

```bash
git fetch origin main
git switch -c fix/<topic> --no-track origin/main     # --no-track: the upstream is set by the first push
git push -u origin fix/<topic>                       # when there is something to show
```

In a worktree the auto-named branch usually already starts at the right commit (`git log --oneline origin/main..HEAD` shows only your commits) and tracks `origin/main`. Rename it, and let the first push set the right upstream:

```bash
git branch -m chore/<topic>        # renames the current branch
git push -u origin chore/<topic>   # upstream is origin/chore/<topic>, not origin/main
```

Rename **before** the first push. A renamed branch that is already pushed leaves the old name on GitHub: push the new name, then ask the owner before deleting the old one (`git push origin --delete <old>`).

## Why `git switch main` fails in a worktree

`main` is checked out in the main checkout and git refuses a second checkout of it. To look at or compare with `main`, detach:

```bash
git switch --detach origin/main      # read, run, measure the old code; nothing is committed here
git switch -                         # back to your branch
git diff origin/main...HEAD --stat   # what the branch changes, without switching
```

Commit or stash nothing across that switch: with uncommitted edits git may refuse. Use `git stash push -u -m "<unique tag>"` and apply it by SHA, never a bare `git stash`, since the stash is shared with every worktree.

## Update from `main`

```bash
git fetch origin main
git log --oneline HEAD..origin/main  # what came in
git merge origin/main                # merge, do not rebase a pushed branch (that needs a force-push)
```

Resolve conflicts, run the checks (`custoro-dev-stack`), commit the merge, push. In a Claude desktop app worktree use the app's "sync with base branch" action instead of running the merge yourself.

## Clean up after the merge

Merged branches are not deleted automatically (the remote still has `fix/api-security-review` and the others). A squash-merged branch looks unmerged to git, so check the PR instead:

```bash
gh pr view <branch> --repo dooker/custoro --json state,mergedAt     # MERGED?
git switch --detach origin/main && git branch -D <branch>           # local: -D, because squash hides the merge
git push origin --delete <branch>                                   # remote: only with the owner's yes
git fetch --prune origin                                            # forget the deleted remote branches
```

`git branch -D` refuses while another worktree has the branch checked out (`git worktree list` shows which). A session's worktree is removed by the app when the session is archived, not with `git worktree remove` by hand.

## Check before opening the PR

`git branch --show-current` is the final name; `git log --oneline origin/main..HEAD` is only your commits; the base is `main`. Then `custoro-pr`.
