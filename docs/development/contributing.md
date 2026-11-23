# Contributing

## Branches
- `main` is always demo-able.
- Work on `feat/<area>-<short>` or `fix/<area>-<short>`; open a PR into `main`.

## Commits
Conventional commits: `feat(request-engine): add Hindi erase template`.

## Rules
- Read [../../CLAUDE.md](../../CLAUDE.md) "Ground rules" before touching anything that sends data.
- New state-changing tool → must call `authorize()` from `@dataexit/policy`.
- New request template → add both `en` and `hi`, keep `[verify]` on section numbers.
- Directory entries: never invent grievance contacts; include `source` and `last_checked`.
- No real personal data in the repo, tests or demo inbox.
