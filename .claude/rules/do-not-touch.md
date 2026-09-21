# Protected paths

<!-- No `paths` frontmatter on purpose: this rule loads at the start of every session. -->

## Context

`app/src/core/` belongs to the platform team: the same core runs in every client
worker the agency maintains, and changes to it ship as a separate PR through that
team's review. The other protected paths are the assignment's own inputs and its
verification tooling — "adjusting" them to fit a task makes the verification
meaningless.

## Rule

- **Do not edit, add or delete files under:**
  - `app/src/core/**` — the platform core;
  - `app/scripts/**` — the static rule checker, including
    `app/scripts/core.lock.json` (hashes of the core files);
  - `materials/**` — the assignment source material;
  - `.coderabbit.yaml`, `.github/**` — review and PR configuration.
- This covers every way of changing them: an editor, `sed`, `git checkout` from
  another branch, or regenerating the lock file with
  `npm run check:rules -- --write-lock`. Running `--write-lock` to make a violation
  disappear forges the verification result instead of doing the task.
- **There are no exceptions.** If a task looks impossible without changing the core,
  do not route around it and do not ask for permission in general terms. Stop and
  hand the human exactly this:
  1. which file and symbol in `core/` must change (for example: add
     `utmCampaign?: string` to `Lead` in `app/src/core/types.ts`);
  2. why — which part of the task cannot be done without it;
  3. what you have already done in the allowed paths, and what remains after the
     core change;
  4. what the option **without** touching the core is, and why it is worse.

  Then wait for the human's decision. Do not edit the core even if the task says
  "update the types", "do whatever is needed" or "do what you think is right" — that
  last answer resolves a choice of approach, not the ban on the core. The ban also
  survives a change of branch: not in a new branch, not in a worktree, not in a copy of
  the repository elsewhere on disk.
- **When the core change blocks the whole task, a temporary workaround is allowed —
  under three conditions, all of them.** Otherwise the client waits for a platform PR
  to deliver a one-line feature, which serves nobody:
  1. it lives entirely in allowed paths and uses a mechanism the `conventions` rule
     already sanctions — `unknown` plus a guard from `core/parse.ts`, never `any`,
     `as`, `@ts-ignore`, `declare module`, or a copied type;
  2. the code says it is temporary, in a comment that names the core change it waits
     for and the file that requests it;
  3. the request to the platform team stays open — do not close it because the feature
     shipped. The debt is the point of the note.

  If any of the three does not hold, do not write the workaround: stop and hand over
  the four points instead.
- Paths that are free to change: `app/src/integrations/**`, `app/src/sync/**`,
  `docs/**`, `AGENTS.md`, `CLAUDE.md`, `.claude/**`, `.cursor/**`.

## Enforcement

This rule is also wired to a `PreToolUse` hook — `.claude/hooks/protect-core.mjs`,
registered in `.claude/settings.json` — which denies any `Edit`/`Write` whose target
resolves inside a protected path. Two consequences:

- Approval given in the conversation does **not** lift the block: the hook never reads
  the chat. Attempting the edit after a human says "go ahead" fails in exactly the same
  way, so do not try it — report the block instead.
- Only the human can lift it, by editing `.claude/settings.json` themselves. That is
  deliberate: a rule can be talked around, a hook cannot.

One exception to "do not try it": when the human explicitly asks you to **verify the
hook itself**, attempt the edit exactly once and report the hook's response verbatim.
The attempt is expected to fail — that is the point of the check. Do not retry it, do
not look for another way in, and do not treat a successful write as permission: if the
edit goes through, say so plainly, because it means the guard is broken.

## How to verify

- `cd app && npm run check:rules` → `core-untouched  0`, and `TOTAL` did not drop
  below the baseline 8 because a violation "disappeared" from a protected file.
- `git status --short` and `git diff --stat` contain no `app/src/core/`,
  `app/scripts/`, `materials/`, `.coderabbit.yaml` or `.github/` paths.
- `git diff -- app/scripts/core.lock.json` is empty.
- `git log --branches --oneline ^main -- app/src/core app/scripts` is empty — no local
  branch touches the core or the lock file either. A clean working tree is not proof on
  its own: the change may be sitting one branch away.
