---
description: Create a new integration the way the architecture prescribes — module, test and one registry line — with no core changes and no new dependencies.
argument-hint: <service name, e.g. Telegram>
---

# Generate integration

**Target:** $ARGUMENTS
(If the line above holds no service name, the target is in the message right after the
command name. If it is not there either — ask and stop.)

## Steps

1. Read the example that already follows the conventions —
   `app/src/integrations/slack-notify.ts` and
   `app/src/integrations/slack-notify.test.ts` — plus the `Integration` contract in
   `app/src/core/types.ts` and the registry `app/src/integrations/index.ts`.
2. Decide the module name in kebab-case (`<service>-<action>`, e.g. `telegram-notify`)
   and the environment variables it needs. Do not invent or store any values — only
   names, in `requiredEnv`.
3. Create `app/src/integrations/<kebab-name>.ts`: an object implementing `Integration`
   (`name` equal to the file name, `requiredEnv`, `send(lead): Promise<Result<void>>`).
   HTTP, env, JSON and logging go through the core only, per the `conventions` rule.
4. Decide whether this is a **notification** (Slack, messengers) or a **system of
   record** (sheet, CRM) and apply data minimisation accordingly: `email` and `phone`
   never go into a notification.
5. Create `app/src/integrations/<kebab-name>.test.ts` with three cases: successful
   delivery (assert the URL and the request body), a missing environment variable, an
   error from the external system. No real network: `vi.stubGlobal("fetch", ...)`,
   `vi.stubEnv`.
6. Add **one line** to `app/src/integrations/index.ts` — the import and the array entry.
7. Verify: `cd app && npm test && npm run typecheck && npm run check:rules`.
8. Show a summary: the files created, the registry line, `requiredEnv`, and the numbers
   from all three checks.

## Acceptance criteria

- [ ] Exactly three changes under `app/src/`: the new module, the new test, `+1` line
      in `index.ts` (check `git status --short`).
- [ ] `cd app && npm test` is green; at least three new tests.
- [ ] `cd app && npm run check:rules` → `TOTAL` did not grow against the state before
      the command; no violations in the new files.
- [ ] `cd app && npm run typecheck` reports no errors.
- [ ] `git diff --stat` contains no `app/src/core/`, `app/scripts/` or `package.json`.

## Stop

- Do not touch `app/src/core/**` at all: if the core's public API is missing something
  the integration needs, stop per the `do-not-touch` rule and describe what is missing.
- Add no dependencies (do not run `npm install`) — only `node:*` and relative imports.
- Show the summary to the human before finishing; do not move on to other integrations
  or "fix the neighbouring file while I am here".
