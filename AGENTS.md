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

Run all three before and after your change and compare the two results: every test
green, `typecheck` clean, and no new `check:rules` violations. Absolute numbers age —
what matters is that nothing got worse than the state you started from.

## Project map

| Path | What it is |
|---|---|
| `app/src/core/` | Platform: `types.ts`, `http.ts`, `config.ts`, `parse.ts`, `log.ts`. **Protected** |
| `app/src/integrations/` | One module per external system plus the `index.ts` registry |
| `app/src/sync/` | The sync run (`run.ts`) and the state between runs (`state.ts`) |
| `app/scripts/`, `materials/` | Rule checker and assignment material. **Protected** |
| `docs/` | Project notes and reports |

## Rules in one line each

Full wording and a "how to verify" section live in `.claude/rules/`; each line below
links to the rule that owns it:

1. `app/src/core/**`, `app/scripts/**`, `materials/**`, `.coderabbit.yaml` and
   `.github/**` are never edited — no exceptions ([do-not-touch](.claude/rules/do-not-touch.md)).
2. Dependency direction: `integrations/` and `sync/` → `core/`, never the other way
   ([architecture](.claude/rules/architecture.md)).
3. A new integration is exactly three changes: module, test next to it, one line in
   `integrations/index.ts` ([architecture](.claude/rules/architecture.md)).
4. Errors are values: `Result<T>` instead of exceptions; `send()` returns
   `Result<void>` ([conventions](.claude/rules/conventions.md)).
5. Through the core and only through it: HTTP → `postJson()`, env → `readEnv()`,
   JSON → `parseJson(text, guard)`, logging → `log` ([conventions](.claude/rules/conventions.md)).
6. No `any`, no new dependencies ([conventions](.claude/rules/conventions.md)).
7. Notifications never carry a lead's `email` or `phone` — only `name`, `source`,
   `budgetUsd` ([conventions](.claude/rules/conventions.md)).

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
