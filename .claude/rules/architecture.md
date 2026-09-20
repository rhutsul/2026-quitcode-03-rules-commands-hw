---
paths:
  - "app/src/**/*.ts"
---

# lead-sync architecture

## Context

`lead-sync` was migrated from an n8n workflow into three layers. Breaking the
dependency direction returns the project to the "everything depends on everything"
state it was rewritten to escape (`materials/architecture-brief.md`).

## Rule

- Layers and dependency direction — exactly this:
  - `app/src/core/` — the platform (types, HTTP, config, parsing, logger). Imports
    nothing from `integrations/` or `sync/`;
  - `app/src/integrations/` — one module per external system plus the `index.ts`
    registry. Imports only from `core/`, knows nothing about `sync/`;
  - `app/src/sync/` — the sync run and the state between runs. Talks to integrations
    only through the `Integration` contract in `core/types.ts` and the
    `integrations/index.ts` registry — never by importing a concrete integration
    module.
- A new external system means exactly three changes: a new file
  `app/src/integrations/<kebab-name>.ts`, a test next to it `<kebab-name>.test.ts`,
  and one line in `app/src/integrations/index.ts`. No new folders, layers or
  "helpers".
- An integration module exports an object implementing `Integration`: `name`
  (kebab-case, identical to the file name), `requiredEnv` (variable names only),
  `send(lead)`.
- The public API of the core is exactly this. Nothing else exists, and inventing new
  entries is not allowed:
  - `core/types.ts` → `Lead`, `Result<T>`, `Integration`;
  - `core/http.ts` → `postJson(url, body, options?)`, `PostOptions`;
  - `core/config.ts` → `readEnv(name)`;
  - `core/parse.ts` → `parseJson(text, guard, label?)`, `Guard<T>`, `isRecord`,
    `isString`, `isNumber`;
  - `core/log.ts` → `log.info`, `log.warn`, `log.error`, `redact(text)`.
- If the core lacks something you need, do not add it to `core/` and do not invent a
  "similar" name: stop and describe what is missing (see the `do-not-touch` rule).

## How to verify

- `cd app && npm run check:rules` → the `core-untouched` line is `0`.
- `cd app && npm run typecheck` is clean: a non-existent core export fails here first.
- `grep -rn "sync/" app/src/integrations/` returns nothing.
- New integration: the diff contains exactly three files (module, test, `+1` line in
  `index.ts`).
