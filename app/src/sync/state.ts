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
// every run report zero pending leads. A syntactically valid but non-existent date is
// just as harmful — `Date.parse("2026-02-31T00:00:00.000Z")` succeeds and silently
// means 3 March, so leads created in between would never be picked up again. Hence the
// round trip: the value has to survive parsing unchanged.
const ISO_UTC = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/;

function canonicalIsoUtc(value: string): string | null {
  const match = ISO_UTC.exec(value);
  if (match === null) return null;
  return `${match[1]}.${(match[2] ?? "").padEnd(3, "0")}Z`;
}

const isIsoUtc = (value: unknown): value is string => {
  if (!isString(value)) return false;
  const canonical = canonicalIsoUtc(value);
  if (canonical === null) return false;
  const parsed = Date.parse(canonical);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === canonical;
};

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

  const parsed = parseJson(text, isSyncState, "sync-state");
  if (!parsed.ok) return parsed;

  // `runSync` compares checkpoints with `lead.createdAt` as strings, so the stored form
  // has to be canonical: `…:00Z` is chronologically older than `…:00.500Z` but sorts
  // after it, which would hide that lead forever.
  return { ok: true, value: { lastSyncedAt: canonicalIsoUtc(parsed.value.lastSyncedAt) ?? parsed.value.lastSyncedAt } };
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
