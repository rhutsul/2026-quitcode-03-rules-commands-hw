# AGENTS.md — lead-sync

`lead-sync` is a worker migrated from an n8n workflow for the client Studio Nova.
Every 5 minutes it picks up new leads from the website form and fans them out to
integrations: the managers' Slack channel, a Google Sheet, then CRMs and messengers.
TypeScript, Node 22+, Vitest, zero runtime dependencies; all data is synthetic.

## Commands

All of them from the `app/` directory:

| Task | Command |
|---|---|
| Install | `npm install` |
| Tests | `npm test` |
| Typecheck | `npm run typecheck` |
| Project rule check | `npm run check:rules` |

Current state of this branch: **30 tests green**, `typecheck` clean, `check:rules` →
`TOTAL: 0`. Any number above zero means something regressed — compare before and after
your change rather than trusting the absolute value.

## Project map

| Path | What it is |
|---|---|
| `app/src/core/` | Platform: `types.ts`, `http.ts`, `config.ts`, `parse.ts`, `log.ts`. **Protected** |
| `app/src/integrations/` | One module per external system plus the `index.ts` registry |
| `app/src/sync/` | The sync run (`run.ts`) and the state between runs (`state.ts`) |
| `app/scripts/`, `materials/` | Rule checker and assignment material. **Protected** |
| `docs/` | Project notes and reports |

## Rules in one line each

Full wording and a "how to verify" section live in `.claude/rules/` — this is the
list only:

1. `app/src/core/**`, `app/scripts/**`, `materials/**`, `.coderabbit.yaml` and
   `.github/**` are never edited — no exceptions (`do-not-touch`).
2. Dependency direction: `integrations/` and `sync/` → `core/`, never the other way
   (`architecture`).
3. A new integration is exactly three changes: module, test next to it, one line in
   `integrations/index.ts` (`architecture`).
4. Errors are values: `Result<T>` instead of exceptions; `send()` returns
   `Result<void>` (`conventions`).
5. Through the core and only through it: HTTP → `postJson()`, env → `readEnv()`,
   JSON → `parseJson(text, guard)`, logging → `log` (`conventions`).
6. No `any`, no new dependencies (`conventions`).
7. Notifications never carry a lead's `email` or `phone` — only `name`, `source`,
   `budgetUsd` (`conventions`).

## Before committing

```bash
cd app && npm test && npm run typecheck && npm run check:rules
```

Tests green, typecheck clean, `TOTAL` no higher than before your change,
`core-untouched` at `0`, and `git status --short` free of protected paths.

## Agent commands

Repeated work is packaged as commands in `.claude/commands/` (Cursor:
`.cursor/commands/`): `/analyze-error <log>`, `/refactor <file>`,
`/generate-integration <service>`.
