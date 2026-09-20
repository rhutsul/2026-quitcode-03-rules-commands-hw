# Перевірка (Task B, C і бонус E)

> Тут — лише те, що справді сталося в сесіях: цитати, числа, імена файлів.
> Базова лінія до всіх прогонів: `npm test` → 18 passed, `npm run check:rules` →
> `TOTAL: 8 violation(s)` (7 у `src/integrations/sheets-append.ts`, 1 у `src/sync/state.ts`).

## Task B — чи бачить інструмент AGENTS.md

- Інструмент: Claude Code (десктопний застосунок, вкладка Code) · модель Opus 5 ·
  Node v24.18.0
- Як перевірив: `/context` у новій сесії, розділ **Memory files**
- Результат — `/context` показав три файли пам'яті, разом 2.2k токенів:

  | Файл | Токенів |
  |---|---|
  | `CLAUDE.md` | 282 |
  | `AGENTS.md` | 1.1k |
  | `.claude/rules/do-not-touch.md` | 854 |

  Що з цього видно:

  1. **`AGENTS.md` завантажився** — хоча Claude Code читає `CLAUDE.md`, а не
     `AGENTS.md`. Це і є результат заміни markdown-посилання на імпорт `@AGENTS.md`:
     до заміни файл у Memory files не з'являвся.
  2. **`do-not-touch.md` завантажився на старті сесії** — правило без `paths`,
     як і задумано.
  3. **`architecture.md` і `conventions.md` у Memory files відсутні** — і це
     правильно: вони прив'язані до `app/src/**/*.ts` і підтягуються лише тоді, коли
     агент працює з файлами застосунку. Тобто режими застосування обрано свідомо, а
     не «все завжди».
  4. Три команди зареєструвалися як skills: `analyze-error`, `refactor`,
     `generate-integration`.

## Task C — прогони команд

### `/analyze-error`

- Виклик: `/analyze-error materials/error-log.txt`
- Чи підставився `$ARGUMENTS`: _(заповнюється)_
- Що агент назвав корінною причиною (файл, рядок, механізм): _(заповнюється)_
- Чим відрізнив тригер від причини: _(заповнюється)_
- Чи зупинився там, де сказано в Stop: _(заповнюється)_
- Чи знадобилась ітерація команди: _(заповнюється)_

### `/refactor`

- Виклик: `/refactor app/src/integrations/sheets-append.ts`
- `npm run check:rules` для цього файлу: до 7 → після _(заповнюється)_; `TOTAL` 8 → _(заповнюється)_
- `npm test` до / після: 18 passed / _(заповнюється)_
- Що змінилось у поведінці (має бути: нічого з того, що фіксують тести): _(заповнюється)_

### `/generate-integration`

- Виклик: `/generate-integration Telegram`
- Які файли створено: _(заповнюється)_
- `npm test`, `npm run check:rules`: _(заповнюється)_

## Task E (бонус) — хук

- Файли: `.claude/settings.json`, `.claude/hooks/protect-core.mjs`
- Спроба змінити `app/src/core/...` → що відповів хук (цитата): _(заповнюється)_
