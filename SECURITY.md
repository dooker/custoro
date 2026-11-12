# Security policy

## Status

Custoro 5.0.0 is in **release candidates** (`5.0.0-rc.N`) before its first production use. The
findings of the 2026 security reviews are fixed; no security issue is known to be open. What is open
by design (for example, logging out ends the sessions on every device) is listed with the review
skill in `.claude/skills/custoro-security-review/references/known-open.md`.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report them privately through GitHub instead:
**Security** tab → **Report a vulnerability** (private vulnerability reporting).

Include what you found, how to reproduce it, and the affected part (`apps/api` or `apps/web`).
You can expect an acknowledgement within a few days.

## Supported versions

Fixes go to `main` and into the next release; only the newest release (or release candidate)
receives them.
