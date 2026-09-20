import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadState, saveState } from "./state.js";

let dir: string;
let statePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lead-sync-state-"));
  statePath = join(dir, "sync-state.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadState", () => {
  it("вважає відсутній файл першим запуском", () => {
    const state = loadState(statePath);

    expect(state).toEqual({ ok: true, value: { lastSyncedAt: "1970-01-01T00:00:00.000Z" } });
  });

  it("читає збережений стан", () => {
    writeFileSync(statePath, JSON.stringify({ lastSyncedAt: "2026-09-09T23:55:00.000Z" }));

    const state = loadState(statePath);

    expect(state).toEqual({ ok: true, value: { lastSyncedAt: "2026-09-09T23:55:00.000Z" } });
  });

  // Саме це лишає обірваний ENOSPC-запис: writeFileSync спершу обрізає файл до нуля.
  it("повертає помилку на порожньому файлі, а не епоху", () => {
    writeFileSync(statePath, "");

    const state = loadState(statePath);

    expect(state.ok).toBe(false);
  });

  it("повертає помилку на зіпсованому JSON", () => {
    writeFileSync(statePath, "{ broken");

    const state = loadState(statePath);

    expect(state.ok).toBe(false);
  });

  it("повертає помилку на неочікуваній формі", () => {
    writeFileSync(statePath, JSON.stringify({ lastSyncedAt: 1757462100000 }));

    const state = loadState(statePath);

    expect(state.ok).toBe(false);
  });
});

describe("saveState", () => {
  it("записує стан і читає його назад", () => {
    const saved = saveState(statePath, { lastSyncedAt: "2026-09-10T08:00:00.000Z" });

    expect(saved).toEqual({ ok: true, value: undefined });
    expect(loadState(statePath)).toEqual({ ok: true, value: { lastSyncedAt: "2026-09-10T08:00:00.000Z" } });
  });

  it("повертає помилку замість винятку, якщо записати не вдалося", () => {
    const saved = saveState(join(dir, "no-such-dir", "sync-state.json"), {
      lastSyncedAt: "2026-09-10T08:00:00.000Z",
    });

    expect(saved.ok).toBe(false);
  });
});
