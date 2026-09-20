---
description: Turn a log or stack trace into a root cause (file, line, mechanism), separating the trigger from the cause. Changes no code.
argument-hint: <path to a log file, or the stack trace text>
---

# Analyze error

**Target:** $ARGUMENTS
(If the line above holds no concrete file or text, the target is in the message right
after the command name. If it is not there either — ask and stop.)

## Steps

1. Read the target in full. Write out a **timeline** with timestamps: when the symptom
   started, which external event preceded it, when that event was cleared, when the
   symptom stopped — and whether it stopped at all.
2. Read the code named in the stack together with the modules it calls. In this
   project that usually means `app/src/sync/`, `app/src/integrations/` and the
   contracts in `app/src/core/types.ts`.
3. **Separate the trigger from the cause.** The trigger is the external event that
   started it (disk full, HTTP 429, a timeout). The cause is what kept the system from
   returning to a healthy state on its own. Control question: if the trigger was
   cleared at `T` and the symptom continued until `T+N`, what in the code kept
   reproducing it? Until that has an answer with a file name and a line number, the
   root cause has not been found.
4. Verify the hypothesis against the code: point at the concrete line and state the
   mechanism ("this `catch` branch returns a default value, therefore …") rather than
   describing it in general terms.
5. Check the finding against the project conventions (the `conventions` rule) — a root
   cause is often a direct violation of one of them; name which one.
6. Propose a **test that reproduces the problem**: which file, what it stubs, what it
   asserts. Describe it in prose — do not create the file.
7. Propose the fix as a plan: which file, which change, and why it treats the cause
   rather than the symptom. If the fix would touch `app/src/core/**`, follow the
   `do-not-touch` rule.

## Acceptance criteria

- [ ] The report separates **trigger** and **root cause** explicitly, and explains why
      the trigger does not account for how long the incident lasted.
- [ ] The root cause is named as `file:line` plus the mechanism, in one sentence.
- [ ] The project convention that this code violates is named (or it is stated that
      none is violated).
- [ ] The reproducing test is described: file, inputs, expectation.
- [ ] No file was created or modified.

## Stop

Stop after the report. **Do not change code**: neither the fix nor the test is written
without the human's confirmation. Show the report and the plan, then wait.
