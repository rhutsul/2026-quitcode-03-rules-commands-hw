---
description: Bring one file up to the project conventions without changing behaviour; tests and check:rules before and after.
argument-hint: <file path, e.g. app/src/integrations/sheets-append.ts>
---

# Refactor

**Target:** $ARGUMENTS
(If the line above holds no concrete file, the target is in the message right after the
command name. If it is not there either — ask and stop.)

## Steps

1. **Record the "before" state** and print the numbers in the chat. Run the three
   checks as separate commands and report each status on its own, so a failure in one
   does not hide the other two:
   ```bash
   cd app
   npm test
   npm run typecheck
   npm run check:rules
   ```
   Take the `by file` line for the target file out of the `check:rules` output.
2. Read the target file, its test next to it (`<name>.test.ts`), and the core modules
   you will need (`core/http.ts`, `core/config.ts`, `core/parse.ts`, `core/log.ts`,
   `core/types.ts`).
3. List the violations `check:rules` reports for this file and what replaces each one,
   per the `conventions` rule. Reference the rule — do not copy it into the chat.
4. Change **only the target file**. The behaviour the tests pin stays identical: the
   request URL, the request body, the error texts, the returned values.
5. **Record the "after" state** with the same three commands, again separately.
6. Show a before/after table: violations for the file, number of tests, typecheck
   status.

## Acceptance criteria

- [ ] Violations in the target file went down; in every other file they did not go up.
- [ ] `cd app && npm test` is green and the test count did not shrink.
- [ ] `cd app && npm run typecheck` reports no errors.
- [ ] `git diff --stat` lists the target file only — unless the human approved a
      named additional file when you asked (see Stop); `app/src/core/**` is never on
      that list.
- [ ] Test assertions were not edited: `git diff -- "*.test.ts"` is empty.

## Stop

- Edit **only the file given**. If the refactor needs a change in another module, stop
  and ask before touching it.
- **Do not edit assertions in tests.** A test failing after the refactor means you
  changed behaviour: revert the change, not the test.
- If the conventions cannot be satisfied without changing `app/src/core/**`, stop per
  the `do-not-touch` rule and describe the core change that would be needed.
