// Стан синхронізації між запусками: ліди, створені після lastSyncedAt, ще не розіслані.
// Читання й запис повертають Result: «не можу прочитати стан» не має права мовчки
// перетворитись на «нічого ніколи не синхронізували» — саме так виник інцидент
// 09→10.09.2026 (див. materials/error-log.txt).
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { isRecord, isString, parseJson } from "../core/parse.js";
import type { Result } from "../core/types.js";

export interface SyncState {
  /** ISO-8601, UTC. */
  lastSyncedAt: string;
}

const INITIAL_STATE: SyncState = { lastSyncedAt: "1970-01-01T00:00:00.000Z" };

// `lastSyncedAt` is compared with `lead.createdAt` as a string, so the shape matters as
// much as the type: `"z"` is a string, sorts above every ISO timestamp, and would make
// every run report zero pending leads.
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const isIsoUtc = (value: unknown): value is string =>
  isString(value) && ISO_UTC.test(value) && Number.isFinite(Date.parse(value));

const isSyncState = (value: unknown): value is SyncState =>
  isRecord(value) && isIsoUtc(value.lastSyncedAt);

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

/**
 * Write through a temporary file in the same directory, then rename over the target.
 * A plain `writeFileSync` truncates the target first, so a write that fails midway —
 * a full disk, exactly as in the 09→10.09 incident — destroys the checkpoint that was
 * already there. A rename is atomic: either the old state survives or the new one does.
 */
export function saveState(path: string, state: SyncState): Result<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(state, null, 2));
    renameSync(temporary, path);
    return { ok: true, value: undefined };
  } catch (error) {
    rmSync(temporary, { force: true });
    return { ok: false, error: `sync-state: cannot write ${path}: ${reason(error)}` };
  }
}
