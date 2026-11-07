---
name: custoro-release
description: Cut a Custoro release - choose the next version (major, minor or patch) from the CHANGELOG, set it in every package file, date the changelog section and open the release PR, which the Release workflow tags and publishes once merged. Also explains the build number (the git commit) shown by GET /api/ and the sidebar. Use only when the user asks to "release", "cut a release", "bump the version", "make version 5.0.0", "what should the next version be" or "tag a release".
disable-model-invocation: true
---

# Custoro releases

Facts: one version for the whole repository (root, API and web: three `package.json` and three `package-lock.json` files, checked by the `version` CI job), x.y.z only. `CHANGELOG.md` gathers entries under `## Unreleased` until a release turns them into `## x.y.z - YYYY-MM-DD`. The build number is not part of the version: it is the git commit an image was built from (`scripts/docker-build.sh` passes `APP_BUILD` and `APP_BUILT_AT`), shown by `GET /api/` (`{version, build, builtAt}`), in the sidebar ("v 5.0.0 · 38bdbcb") and as the Sentry release `custoro@5.0.0+38bdbcb`. Images built with a plain `docker compose build` say "unknown".

## 1. Choose the number

```bash
npm run version:suggest     # major/minor/patch, the current and next version, and the lines that decided
```

| Bump  | When                                                                                                                                                 |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| major | an existing install must act or it stops working: a setting it must add, the API refuses to start, everyone logged out, an entry marked **Breaking** |
| minor | anything under Added or Changed, or a migration (it runs on its own)                                                                                 |
| patch | Fixed and Security entries only                                                                                                                      |

The suggestion reads the wording of the entries, so it is a proposal: read `## Unreleased` yourself, and say which entry decides. A changed meaning of a setting with a safe default (PR 24's `RESET_MAX_REQUESTS_PER_ACCOUNT`) is not major. When an entry needs an operator to act, write it in bold as the existing ones do, or start it with **Breaking:**, so the next suggestion sees it.

## 2. Prepare the release PR

```bash
git fetch origin main
git switch -c chore/release-<version> --no-track origin/main      # custoro-branch
npm run release:prepare -- <major|minor|patch|x.y.z>              # sets the 6 files, dates the changelog
npm run version:check                                             # prints the new version
git add package.json package-lock.json apps/api/package.json apps/api/package-lock.json \
        apps/web/package.json apps/web/package-lock.json CHANGELOG.md
git commit                                                        # "Release <version>", trailer as in custoro-pr
```

`release:prepare` refuses an empty `Unreleased`, a version that is not above the current one and a version that already has a section. It changes only the `version` lines (and the lock files' root package), so the diff is 7 files and about 20 lines. Open the PR with `custoro-pr`; the body is the release notes (`npm run release:notes -- <version>`) plus the deploy notes the entries call for.

## 3. Merge, and the workflow does the rest

`.github/workflows/release.yml` runs on every push to `main` and acts only when that push changed the version and the version has no tag yet: it builds the images with `scripts/docker-build.sh`, pushes `ghcr.io/<owner>/custoro-api:<version>` and `custoro-web:<version>`, then tags the commit `v<version>` and creates the GitHub release with the changelog section. A failed run leaves no tag: fix the cause and start it again from the Actions tab (`workflow_dispatch`), which releases the current version when it has no tag. Do not run it by hand while the version is 4.0.0: 4.0.0 has no tag, and the run would tag today's `main` as 4.0.0.

Merging, tagging and pushing are the owner's actions: prepare the PR, say what will happen, and wait.

## 4. Deploying it

`custoro-deploy` writes the runbook. A server either builds from the tag (`git checkout v<version> && scripts/docker-build.sh`) or pulls the published images (`API_IMAGE` and `WEB_IMAGE` in `.env` set to the version, never `latest`), so a rollback is the previous tag (with the backup, after a migration). Check after the deploy that `curl -s <app>/api/` names the expected version and build.
