#!/usr/bin/env node
// PreToolUse hook: blocks every write into the protected paths of this repository.
//
// The `do-not-touch` rule *asks* the agent not to edit app/src/core/**; this hook
// *prevents* it. Claude Code feeds the tool call as JSON on stdin; exit code 2 means
// "deny", and whatever we print to stderr is handed back to the model as the reason.
//
// Node, not bash, so it works the same on Windows.
import { isAbsolute, relative, resolve, sep } from "node:path";

const PROTECTED = [
  "app/src/core",
  "app/scripts",
  "materials",
  ".github",
  ".coderabbit.yaml",
];

const readStdin = async () => {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
};

const toPosix = (path) => path.split(sep).join("/");

/** Every path this tool call would write to. */
function targets(input) {
  if (!input || typeof input !== "object") return [];
  const found = [input.file_path, input.notebook_path, input.path];
  if (Array.isArray(input.edits)) found.push(...input.edits.map((edit) => edit?.file_path));
  return found.filter((value) => typeof value === "string" && value.length > 0);
}

// A shell command never reaches the Edit/Write branch, so `sed -i app/src/core/...`
// would walk straight past this hook. Reading a protected path stays allowed —
// otherwise checking the repository state becomes impossible.
// `>>?\s*[^&\s]` deliberately does not match `2>&1`: duplicating a file descriptor
// writes nothing to disk.
const SHELL_WRITES = /(^|\s)(sed\s+-i|tee|truncate|rm|mv|cp|dd)\b|>>?\s*[^&\s]/;
const LOCK_REWRITE = /--write-lock/;

/**
 * Text that a command merely *carries* — a heredoc body, a quoted string — is not a
 * command. Without this, writing a commit message that mentions core.lock.json would
 * be blocked, which is how this function earned its existence.
 */
function stripLiterals(command) {
  let stripped = command.replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\2$/gm, " ");
  // An unterminated heredoc (the body is still being streamed) — drop the tail.
  stripped = stripped.replace(/<<-?\s*(['"]?)[A-Za-z_][A-Za-z0-9_]*\1[\s\S]*$/, " ");
  return stripped.replace(/'[^']*'|"[^"]*"/g, " ");
}

/** Why this shell command is refused, or null when it only reads. */
function shellRefusal(rawCommand) {
  if (typeof rawCommand !== "string" || rawCommand.length === 0) return null;
  const command = stripLiterals(rawCommand);
  if (LOCK_REWRITE.test(command)) {
    return "it regenerates app/scripts/core.lock.json (--write-lock), which forges the check:rules result";
  }
  if (!SHELL_WRITES.test(command)) return null;
  const guarded = PROTECTED.find((path) => command.includes(path));
  return guarded === undefined ? null : `it writes to the protected path ${guarded}/`;
}

function protectedMatch(target, projectDir) {
  const absolute = isAbsolute(target) ? target : resolve(projectDir, target);
  const rel = toPosix(relative(projectDir, absolute));
  // Outside the project: not ours to guard.
  if (rel.startsWith("../")) return null;
  return PROTECTED.find((guarded) => rel === guarded || rel.startsWith(`${guarded}/`)) ?? null;
}

const raw = await readStdin();
let payload = {};
try {
  payload = JSON.parse(raw);
} catch {
  // A malformed payload must not silently disable the guard.
  console.error("protect-core: could not parse the hook payload — blocking to stay safe.");
  process.exit(2);
}

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? payload.cwd ?? process.cwd();

const refusal = payload.tool_name === "Bash" ? shellRefusal(payload.tool_input?.command) : null;
if (refusal !== null) {
  console.error(
    [
      `protect-core: blocked a shell command because ${refusal}.`,
      "",
      "Reading these paths is fine; writing to them is not. If the task genuinely needs",
      "a core change, stop and hand over the four points from the do-not-touch rule.",
      "Only the human can lift this, by editing .claude/settings.json themselves.",
    ].join("\n"),
  );
  process.exit(2);
}

for (const target of targets(payload.tool_input)) {
  const guarded = protectedMatch(target, projectDir);
  if (guarded === null) continue;

  console.error(
    [
      `protect-core: blocked a write to ${toPosix(target)} — ${guarded}/ is a protected path.`,
      "",
      "app/src/core/** belongs to the platform team; app/scripts/**, materials/**,",
      ".github/** and .coderabbit.yaml are the assignment's inputs and its verification tooling.",
      "",
      "This hook does not take permission from the conversation: a human saying",
      '"go ahead" does not unblock it. If the task genuinely needs a core change,',
      "stop and hand over the four points from the do-not-touch rule (file and symbol,",
      "why, what is done and what remains, the option without the core change).",
      "Only the human can lift this, by editing .claude/settings.json themselves.",
    ].join("\n"),
  );
  process.exit(2);
}

process.exit(0);
