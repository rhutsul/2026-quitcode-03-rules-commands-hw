// Стан синхронізації між запусками: ліди, створені після lastSyncedAt, ще не розіслані.
// Читання й запис повертають Result: «не можу прочитати стан» не має права мовчки
// перетворитись на «нічого ніколи не синхронізували» — саме так виник інцидент
// 09→10.09.2026 (див. materials/error-log.txt).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isRecord, isString, parseJson } from "../core/parse.js";
import type { Result } from "../core/types.js";

export interface SyncState {
  /** ISO-8601, UTC. */
  lastSyncedAt: string;
}

const INITIAL_STATE: SyncState = { lastSyncedAt: "1970-01-01T00:00:00.000Z" };

const isSyncState = (value: unknown): value is SyncState =>
  isRecord(value) && isString(value.lastSyncedAt);

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Відсутній файл — це легітимний перший запуск.
 * Наявний, але нечитний чи зіпсований — помилка, а не значення за замовчуванням.
 */
export function loadState(path: string): Result<SyncState> {
  if (!existsSync(path)) return { ok: true, value: { ...INITIAL_STATE } };

  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    return { ok: false, error: `sync-state: cannot read ${path}: ${reason(error)}` };
  }

  return parseJson(text, isSyncState, "sync-state");
}

export function saveState(path: string, state: SyncState): Result<void> {
  try {
    writeFileSync(path, JSON.stringify(state, null, 2));
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: `sync-state: cannot write ${path}: ${reason(error)}` };
  }
}
