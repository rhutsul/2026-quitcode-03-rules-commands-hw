# CLAUDE.md

@AGENTS.md

## Claude Code specifics for this repository

- Detailed rules live in `.claude/rules/`: `do-not-touch.md` (no `paths` — active in
  every session), `architecture.md` and `conventions.md` (scoped to
  `app/src/**/*.ts`).
- Commands live in `.claude/commands/`: `/analyze-error`, `/refactor`,
  `/generate-integration`. The argument is substituted into `$ARGUMENTS`.
- The app lives in `app/`. Run npm from there (`cd app && npm test`) or use
  `npm --prefix app`.
- Files ending in `.off` are rules or commands deliberately disabled for an A/B run
  (Task D of this homework). Do not "fix" them or rename them back unasked.
