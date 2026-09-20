---
paths:
  - "app/src/**"
---

# lead-sync code conventions

## Context

Every convention in `materials/architecture-brief.md` has already cost an incident:
lost timeouts, tokens in the log, silently corrupted state. The static check in
`app/scripts/check-rules.mjs` knows each of them by id.

## Rule

- **Errors are values.** A function that can fail returns `Result<T>` from
  `core/types.ts`. An integration never throws outward: `send()` always returns
  `Result<void>`. Do not use `throw` to report an expected failure.
- **Outgoing HTTP only through `postJson()`** from `app/src/core/http.ts` (it holds
  the timeout, the retries on 5xx/429 and URL redaction). No bare `fetch(` in
  `integrations/` or `sync/`.
- **Environment only through `readEnv(name)`** from `app/src/core/config.ts`. No
  `process.env` outside `core/config.ts`. Never log secret values and never hardcode
  them — not even "temporarily".
- **Any external JSON only through `parseJson(text, guard)`** from
  `app/src/core/parse.ts`, with a guard for the expected shape (`isRecord`,
  `isString`, `isNumber`). No `JSON.parse` outside `core/parse.ts`. Invalid JSON or
  an unexpected shape is a `Result` with `ok: false` that shows up in the log.
  Silently substituting a default value and carrying on is not allowed: corrupted
  data then becomes invisible.
- **Logging only through `log`** from `app/src/core/log.ts` (it redacts tokens).
  No `console.log` / `console.error` / any other `console.*` outside `core/log.ts`.
- **No `any`.** Not `: any`, not `as any`, not `<any>`. For unknown data use
  `unknown` plus a guard from `core/parse.ts`.
- **No new dependencies.** The app has zero runtime dependencies. If a library
  (axios, got, ky, zod…) seems necessary, do not `npm install` — raise it in the PR.
  In production files (`app/src/**/*.ts` except `*.test.ts`) only relative (`./`,
  `../`) and `node:*` imports are allowed. Test files import `vitest` — that is the
  existing devDependency, not a new one; `check:rules` skips `*.test.ts` for the same
  reason.
- **Data minimisation.** Notifications (Slack, Telegram, messengers) carry only
  `name`, `source` and `budgetUsd`. `email` and `phone` never go there — full lead
  data goes only to systems of record (Google Sheet, CRM).
- **Naming.** Files are kebab-case; an integration's `name` field matches its file
  name.
- **Tests.** Vitest, `*.test.ts` next to the module, no real network:
  `vi.stubGlobal("fetch", ...)` and `vi.stubEnv`. Every integration gets three cases:
  successful delivery (assert the URL and the request body), a missing environment
  variable, an error from the external system.
- **Legacy code** is rewritten as a separate task and **without behaviour change** —
  the URL, the request body and the error texts that the tests pin stay identical.

## How to verify

- `cd app && npm run check:rules` → the `http-via-core`, `env-via-config`,
  `json-via-parse`, `log-via-logger`, `no-any`, `no-new-deps` lines did not grow
  against the count you saw before your change (this branch is at `TOTAL: 0`; the
  starter shipped with 8 in legacy code).
- `cd app && npm test` → every test green, and no fewer than before your change.
- `cd app && npm run typecheck` → no errors.
- Data minimisation: no `email` or `phone` in the request body of any notification
  integration.
