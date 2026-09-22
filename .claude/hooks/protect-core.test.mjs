#!/usr/bin/env node
// Checks .claude/hooks/protect-core.mjs: feeds it a hook payload on stdin and compares
// the exit code with the expected one (2 = denied, 0 = allowed).
//
//   node .claude/hooks/protect-core.test.mjs
//
// Every mechanism has a blocked/allowed pair on purpose: a guard that blocks everything
// is as useless as one that blocks nothing, and the negative cases are what caught this
// hook over-blocking twice.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hooksDir = dirname(fileURLToPath(import.meta.url));
const projectDir = join(hooksDir, "..", "..");
const hook = join(hooksDir, "protect-core.mjs");
const abs = (...parts) => join(projectDir, ...parts);

const NL = String.fromCharCode(10);

const cases = [
  ["відносний core", { tool_name: "Edit", tool_input: { file_path: "app/src/core/log.ts" } }, 2],
  ["абсолютний core (Windows)", { tool_name: "Edit", tool_input: { file_path: abs("app", "src", "core", "types.ts") } }, 2],
  ["абсолютний lock", { tool_name: "Write", tool_input: { file_path: abs("app", "scripts", "core.lock.json") } }, 2],
  ["materials", { tool_name: "Edit", tool_input: { file_path: "materials/error-log.txt" } }, 2],
  [".coderabbit.yaml", { tool_name: "Edit", tool_input: { file_path: ".coderabbit.yaml" } }, 2],
  ["MultiEdit, core серед правок", { tool_name: "MultiEdit", tool_input: { edits: [{ file_path: "docs/x.md" }, { file_path: "app/src/core/http.ts" }] } }, 2],
  ["дозволена інтеграція", { tool_name: "Write", tool_input: { file_path: "app/src/integrations/telegram-notify.ts" } }, 0],
  ["абсолютний docs", { tool_name: "Edit", tool_input: { file_path: abs("docs", "verification.md") } }, 0],
  ["sync (дозволено)", { tool_name: "Edit", tool_input: { file_path: "app/src/sync/state.ts" } }, 0],
  ["поза проєктом", { tool_name: "Write", tool_input: { file_path: "C:\\Temp\\scratch.txt" } }, 0],
  ["без шляху", { tool_name: "Edit", tool_input: {} }, 0],
  ["битий payload", "not json", 2],
  ["bash: sed -i по ядру", { tool_name: "Bash", tool_input: { command: "sed -i '1i // x' app/src/core/log.ts" } }, 2],
  ["bash: перезапис lock", { tool_name: "Bash", tool_input: { command: "npm --prefix app run check:rules -- --write-lock" } }, 2],
  ["bash: редирект у materials", { tool_name: "Bash", tool_input: { command: "echo hi > materials/error-log.txt" } }, 2],
  ["bash: rm у core", { tool_name: "Bash", tool_input: { command: "rm app/src/core/log.ts" } }, 2],
  ["bash: читання ядра (дозволено)", { tool_name: "Bash", tool_input: { command: "cat app/src/core/log.ts" } }, 0],
  ["bash: git diff по ядру (дозволено)", { tool_name: "Bash", tool_input: { command: "git diff -- app/scripts/core.lock.json" } }, 0],
  ["bash: check:rules без запису", { tool_name: "Bash", tool_input: { command: "npm --prefix app run check:rules" } }, 0],
  ["bash: запис у docs (дозволено)", { tool_name: "Bash", tool_input: { command: "git diff > docs/ab/x.diff" } }, 0],
  ["bash: 2>&1 біля materials (дозволено)", { tool_name: "Bash", tool_input: { command: "grep -rn lead materials/error-log.txt 2>&1 | head -5" } }, 0],
  ["bash: ls захищеного (дозволено)", { tool_name: "Bash", tool_input: { command: "ls -la app/scripts/" } }, 0],
  ["bash: коміт, що згадує --write-lock у тексті", { tool_name: "Bash", tool_input: { command: ["git commit -q -F - <<PLAIN", "hook: deny --write-lock and writes to app/scripts/core.lock.json", "PLAIN"].join(NL) } }, 0],
  ["bash: echo про core в лапках", { tool_name: "Bash", tool_input: { command: "echo 'app/src/core/log.ts is protected' > docs/note.md" } }, 0],
  ["bash: sed -i лишається заблокованим", { tool_name: "Bash", tool_input: { command: "sed -i 's/a/b/' app/src/core/log.ts" } }, 2],
  ["bash: справжній --write-lock лишається заблокованим", { tool_name: "Bash", tool_input: { command: "npm run check:rules -- --write-lock" } }, 2],
  ["bash -c з редиректом у core (CodeRabbit #1)", { tool_name: "Bash", tool_input: { command: String.fromCharCode(98,97,115,104) + " -c " + JSON.stringify("printf x > app/src/core/types.ts") } }, 2],
  ["sh -c із sed -i по ядру", { tool_name: "Bash", tool_input: { command: "sh -c " + JSON.stringify("sed -i 's/a/b/' app/src/core/log.ts") } }, 2],
  ["bash -c з --write-lock", { tool_name: "Bash", tool_input: { command: "bash -c " + JSON.stringify("npm run check:rules -- --write-lock") } }, 2],
  ["bash -c, що лише читає (дозволено)", { tool_name: "Bash", tool_input: { command: "bash -c " + JSON.stringify("cat app/src/core/log.ts | head -3") } }, 0],
  ["bash: коміт, що цитує атаку через bash -c", { tool_name: "Bash", tool_input: { command: ["git commit -q -F - <<PLAIN", "hook: bash -c with a redirect into app/src/core went through before", "PLAIN"].join(NL) } }, 0],
  ["редирект у лапках (CodeRabbit #2)", { tool_name: "Bash", tool_input: { command: "printf x > " + JSON.stringify("app/src/core/types.ts") } }, 2],
  ["редирект у одинарних лапках", { tool_name: "Bash", tool_input: { command: "printf x > 'app/src/core/types.ts'" } }, 2],
  ["bash -c з редиректом у лапках", { tool_name: "Bash", tool_input: { command: "bash -c " + JSON.stringify("printf x > 'app/src/core/types.ts'") } }, 2],
  ["tee у захищений шлях у лапках", { tool_name: "Bash", tool_input: { command: "echo hi | tee 'app/scripts/core.lock.json'" } }, 2],
  ["git checkout main -- core", { tool_name: "Bash", tool_input: { command: "git checkout main -- app/src/core/log.ts" } }, 2],
  ["node -e із writeFileSync у core", { tool_name: "Bash", tool_input: { command: "node -e " + JSON.stringify("require('fs').writeFileSync('app/src/core/x.ts','')") } }, 2],
  ["node -e, що лише читає", { tool_name: "Bash", tool_input: { command: "node -e " + JSON.stringify("console.log(require('fs').readFileSync('app/src/core/log.ts','utf8').length)") } }, 0],
  ["echo про core в лапках, запис у docs", { tool_name: "Bash", tool_input: { command: "echo 'app/src/core/log.ts is protected' > docs/note.md" } }, 0],
  ["git commit -m із згадкою шляху", { tool_name: "Bash", tool_input: { command: "git commit -m " + JSON.stringify("hook: block writes into app/src/core and app/scripts") } }, 0],
  ["редирект у змінну $P (рев'ю 3)", { tool_name: "Bash", tool_input: { command: "printf x > $P" } }, 2],
  ["редирект у $(pwd)/шлях", { tool_name: "Bash", tool_input: { command: "printf x > $(pwd)/app/src/core/x.ts" } }, 2],
  ["git checkout гілки без pathspec (рев'ю 3)", { tool_name: "Bash", tool_input: { command: "git checkout other-branch" } }, 2],
  ["git reset --hard", { tool_name: "Bash", tool_input: { command: "git reset --hard HEAD~1" } }, 2],
  ["git stash pop", { tool_name: "Bash", tool_input: { command: "git stash pop" } }, 2],
  ["git checkout -- app (покриває core)", { tool_name: "Bash", tool_input: { command: "git checkout -- app" } }, 2],
  ["git checkout -- дозволений шлях", { tool_name: "Bash", tool_input: { command: "git checkout -- app/src/integrations/slack-notify.ts" } }, 0],
  ["git checkout -b нова гілка", { tool_name: "Bash", tool_input: { command: "git checkout -b ws03/experiment" } }, 0],
  ["git reset без --hard (дозволено)", { tool_name: "Bash", tool_input: { command: "git reset -q" } }, 0],
  ["node -e зі складеним шляхом (рев'ю 3)", { tool_name: "Bash", tool_input: { command: "node -e " + JSON.stringify("require('fs').writeFileSync('app/src/'+'core/x.ts','')") } }, 2],
  ["node -e без запису (дозволено)", { tool_name: "Bash", tool_input: { command: "node -e " + JSON.stringify("console.log(1+1)") } }, 0],
  ["rm зі змінною в шляху", { tool_name: "Bash", tool_input: { command: "rm -rf $TARGET/log.ts" } }, 2],
  ["npm test не блокується", { tool_name: "Bash", tool_input: { command: "npm --prefix app test" } }, 0],
  ["git commit звичайний", { tool_name: "Bash", tool_input: { command: "git add -A && git commit -m " + JSON.stringify("fix: something") } }, 0],
];

const extra = [  ["env rm (рев'ю 4)", { tool_name: "Bash", tool_input: { command: "env rm -rf CORE" } }, 2],
  ["command rm (рев'ю 4)", { tool_name: "Bash", tool_input: { command: "command rm -rf CORE" } }, 2],
  ["присвоєння змінної перед rm (рев'ю 4)", { tool_name: "Bash", tool_input: { command: "SAFE=1 rm -rf CORE" } }, 2],
  ["nohup nice rm", { tool_name: "Bash", tool_input: { command: "nohup nice -n 10 rm CORE/log.ts" } }, 2],
  ["timeout rm", { tool_name: "Bash", tool_input: { command: "timeout 5s rm CORE/log.ts" } }, 2],
  ["env VAR=1 із вкладеним sh -c", { tool_name: "Bash", tool_input: { command: "env VAR=1 sh -c " + JSON.stringify("printf x > CORE/x.ts") } }, 2],
  ["xargs rm", { tool_name: "Bash", tool_input: { command: "echo CORE/log.ts | xargs rm" } }, 2],
  ["stdbuf tee у lock", { tool_name: "Bash", tool_input: { command: "stdbuf -oL tee app/scripts/core.lock.json" } }, 2],
  ["env ls (читання, дозволено)", { tool_name: "Bash", tool_input: { command: "env ls -la CORE" } }, 0],
  ["nice npm test (дозволено)", { tool_name: "Bash", tool_input: { command: "nice -n 5 npm --prefix app test" } }, 0],
  ["env сам по собі (дозволено)", { tool_name: "Bash", tool_input: { command: "env" } }, 0],
].map(([name, payload, expected]) => [name, JSON.parse(JSON.stringify(payload).split("CORE").join("app/src/core")), expected]);
cases.push(...extra);

// Case-insensitivity only holds where the filesystem is: on Linux these really are
// different files, and the hook is right to let them through.
const caseFolded = process.platform === "linux" ? 0 : 2;

const pathScopeCases = [
  ["worktree поза проєктом", { tool_name: "Edit", tool_input: { file_path: "C:/Temp/wt/app/src/core/log.ts" } }, 2],
  ["копія репо в іншій теці", { tool_name: "Write", tool_input: { file_path: "D:/backup/repo/app/scripts/core.lock.json" } }, 2],
  ["інший регістр (Windows, macOS)", { tool_name: "Edit", tool_input: { file_path: "APP/SRC/CORE/log.ts" } }, caseFolded],
  ["інший регістр у shell", { tool_name: "Bash", tool_input: { command: "printf x > App/Src/Core/types.ts" } }, caseFolded],
  ["worktree: дозволений шлях", { tool_name: "Write", tool_input: { file_path: "C:/Temp/wt/app/src/integrations/x.ts" } }, 0],
  ["стороння тека, схожа назва", { tool_name: "Write", tool_input: { file_path: "C:/Temp/corelib/log.ts" } }, 0],
];
cases.push(...pathScopeCases);


let failed = 0;
for (const [name, payload, expected] of cases) {
  const input = typeof payload === "string" ? payload : JSON.stringify(payload);
  const run = spawnSync(process.execPath, [hook], { input, env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir } });
  const ok = run.status === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  exit=${run.status} (очікували ${expected})  ${name}`);
}
console.log(failed === 0 ? "\nусі кейси пройшли" : `\n${failed} кейс(ів) впало`);
process.exit(failed === 0 ? 0 : 1);
