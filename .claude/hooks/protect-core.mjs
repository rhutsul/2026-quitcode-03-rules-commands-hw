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

/** The protected prefix this path falls under, or null. */
function protectedMatch(target, projectDir) {
  const cleaned = toPosix(target).replace(/^\.\//, "");
  if (cleaned.length === 0) return null;
  const absolute = isAbsolute(cleaned) ? cleaned : resolve(projectDir, cleaned);
  const rel = toPosix(relative(projectDir, absolute));
  if (rel.startsWith("../")) return null; // outside the project: not ours to guard
  return PROTECTED.find((guarded) => rel === guarded || rel.startsWith(`${guarded}/`)) ?? null;
}

/** Every path a file-editing tool call would write to. */
function targets(input) {
  if (!input || typeof input !== "object") return [];
  const found = [input.file_path, input.notebook_path, input.path];
  if (Array.isArray(input.edits)) found.push(...input.edits.map((edit) => edit?.file_path));
  return found.filter((value) => typeof value === "string" && value.length > 0);
}

// ---------------------------------------------------------------------------
// Shell commands
//
// A PreToolUse matcher on Edit/Write never sees Bash, so `sed -i app/src/core/...`
// would walk straight past this hook. Substring matching is not enough either: a path
// can be quoted (`printf x > 'app/src/core/types.ts'`) and a protected path can appear
// as plain text that writes nothing (`echo 'app/src/core/log.ts is protected' > note`).
// So the command is tokenized, and only two things are judged: the target of a
// redirect, and the arguments of a command that writes.
// ---------------------------------------------------------------------------

function stripHeredocs(command) {
  const closed = command.replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\2$/gm, " ");
  // An unterminated heredoc (the body is still being streamed) — drop the tail.
  return closed.replace(/<<-?\s*(['"]?)[A-Za-z_][A-Za-z0-9_]*\1[\s\S]*$/, " ");
}

const SEPARATORS = new Set(["|", "||", "&", "&&", ";", ";;", "(", ")", "{", "}"]);

/**
 * A deliberately small shell tokenizer. Quotes are removed but their content is kept,
 * so a quoted path stays a path; `2>&1` becomes a descriptor duplication, not a write.
 */
function tokenize(command) {
  const tokens = [];
  let index = 0;

  while (index < command.length) {
    const char = command[index];

    if (/\s/.test(char)) {
      index += 1;
    } else if (char === ";" || char === "|" || char === "&" || "(){}".includes(char)) {
      let operator = char;
      index += 1;
      if (command[index] === char && char !== "(" && char !== ")") {
        operator += char;
        index += 1;
      }
      tokens.push({ type: SEPARATORS.has(operator) ? "separator" : "word", text: operator });
    } else if (char === ">" || char === "<") {
      let operator = char;
      index += 1;
      if (command[index] === char) {
        operator += char;
        index += 1;
      }
      if (command[index] === "&") {
        // 2>&1 and friends: a descriptor duplication writes nothing to disk.
        index += 1;
        while (index < command.length && /[\d-]/.test(command[index])) index += 1;
        tokens.push({ type: "duplication", text: operator });
      } else {
        tokens.push({ type: char === ">" ? "redirect" : "input", text: operator });
      }
    } else {
      let word = "";
      while (index < command.length) {
        const current = command[index];
        if (/\s/.test(current) || ";|&<>(){}".includes(current)) break;
        if (current === "'" || current === '"') {
          const end = command.indexOf(current, index + 1);
          if (end === -1) {
            word += command.slice(index + 1);
            index = command.length;
          } else {
            word += command.slice(index + 1, end);
            index = end + 1;
          }
        } else if (current === "\\") {
          word += command[index + 1] ?? "";
          index += 2;
        } else {
          word += current;
          index += 1;
        }
      }
      tokens.push({ type: "word", text: word });
    }
  }

  return tokens;
}

const baseName = (word) => toPosix(word).split("/").pop() ?? word;

// Commands whose file arguments are written, not read.
const WRITE_COMMANDS = new Set(["tee", "truncate", "rm", "rmdir", "mv", "cp", "dd", "touch", "ln", "install", "shred"]);
const SHELLS = /^(?:ba|z|k|da)?sh(?:\.exe)?$/;
const NODE_WRITES = /\b(?:writeFile|appendFile|rm|rmdir|unlink|rename|mkdir|copyFile|createWriteStream|truncate)/;

/** Split a token list into pipeline segments, one command each. */
function segments(tokens) {
  const result = [[]];
  for (const token of tokens) {
    if (token.type === "separator") result.push([]);
    else result.at(-1).push(token);
  }
  return result.filter((segment) => segment.length > 0);
}

/** Why this shell command is refused, or null when it writes nothing protected. */
function shellRefusal(rawCommand, projectDir, depth = 0) {
  if (typeof rawCommand !== "string" || rawCommand.length === 0) return null;

  // Heredoc bodies are text the command carries, not commands: a commit message may
  // quote an attack without being one.
  const tokens = tokenize(stripHeredocs(rawCommand));

  for (const segment of segments(tokens)) {
    // 1. Targets of `>` and `>>`.
    for (const [position, token] of segment.entries()) {
      if (token.type !== "redirect") continue;
      const target = segment[position + 1];
      if (target?.type !== "word") continue;
      const guarded = protectedMatch(target.text, projectDir);
      if (guarded !== null) return `it redirects output into ${guarded}/`;
    }

    const words = segment.filter((token) => token.type === "word");
    if (words.length === 0) continue;

    // 2. Regenerating the lock file forges the check:rules result.
    if (words.some((word) => word.text === "--write-lock")) {
      return "it regenerates app/scripts/core.lock.json (--write-lock), which forges the check:rules result";
    }

    const command = baseName(words[0].text);
    const rest = words.slice(1);
    const protectedArgument = () => {
      for (const word of rest) {
        if (word.text.startsWith("-")) continue;
        const guarded = protectedMatch(word.text, projectDir);
        if (guarded !== null) return guarded;
      }
      return null;
    };

    // 3. A shell carrying its payload in `-c`: judge that payload as a command.
    if (SHELLS.test(command) && depth < 3) {
      const flagPosition = rest.findIndex((word) => /^-[A-Za-z]*c[A-Za-z]*$/.test(word.text));
      const payload = flagPosition === -1 ? undefined : rest[flagPosition + 1];
      if (payload !== undefined) {
        const refusal = shellRefusal(payload.text, projectDir, depth + 1);
        if (refusal !== null) return refusal;
      }
      continue;
    }

    // 4. Commands that write their file arguments.
    if (WRITE_COMMANDS.has(command)) {
      const guarded = protectedArgument();
      if (guarded !== null) return `it writes to the protected path ${guarded}/`;
    }

    if (command === "sed" && rest.some((word) => /^-[a-zA-Z]*i/.test(word.text))) {
      const guarded = protectedArgument();
      if (guarded !== null) return `it edits ${guarded}/ in place`;
    }

    if (command === "git" && rest.some((word) => ["checkout", "restore", "apply", "clean"].includes(word.text))) {
      const guarded = protectedArgument();
      if (guarded !== null) return `it restores files inside ${guarded}/ from git`;
    }

    // 5. `node -e "...writeFileSync('app/src/core/...')"`.
    if ((command === "node" || command === "node.exe") && rest.some((word) => /^-[ep]$/.test(word.text))) {
      for (const word of rest) {
        if (!NODE_WRITES.test(word.text)) continue;
        for (const candidate of word.text.split(/['"`(),\s]+/)) {
          const guarded = protectedMatch(candidate, projectDir);
          if (guarded !== null) return `the inline script writes to ${guarded}/`;
        }
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------

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

const explain = (headline) =>
  [
    headline,
    "",
    "app/src/core/** belongs to the platform team; app/scripts/**, materials/**,",
    ".github/** and .coderabbit.yaml are the assignment's inputs and its verification tooling.",
    "",
    "This hook does not take permission from the conversation: a human saying",
    '"go ahead" does not unblock it. If the task genuinely needs a core change,',
    "stop and hand over the four points from the do-not-touch rule (file and symbol,",
    "why, what is done and what remains, the option without the core change).",
    "Only the human can lift this, by editing .claude/settings.json themselves.",
  ].join("\n");

if (payload.tool_name === "Bash") {
  const refusal = shellRefusal(payload.tool_input?.command, projectDir);
  if (refusal !== null) {
    console.error(explain(`protect-core: blocked a shell command because ${refusal}.`));
    process.exit(2);
  }
}

for (const target of targets(payload.tool_input)) {
  const guarded = protectedMatch(target, projectDir);
  if (guarded === null) continue;
  console.error(explain(`protect-core: blocked a write to ${toPosix(target)} — ${guarded}/ is a protected path.`));
  process.exit(2);
}

process.exit(0);
