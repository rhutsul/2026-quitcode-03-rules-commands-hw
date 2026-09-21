import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

  it.each(["2026-09-09T23:55:00.000Z", "2026-09-09T23:55:00Z", "2026-09-09T23:55:00.5Z", "2024-02-29T00:00:00.000Z"])(
    "приймає коректну ISO-8601 UTC мітку: %j",
    (value) => {
      writeFileSync(statePath, JSON.stringify({ lastSyncedAt: value }));

      expect(loadState(statePath).ok).toBe(true);
    },
  );

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

  // "z" — рядок, який сортується вище за будь-яку ISO-мітку, тож із ним жоден лід
  // ніколи не потрапив би в pending, а зламаний checkpoint зберігався б далі.
  it.each(["z", "2026-09-10", "10.09.2026", "2026-09-10T08:00:00+02:00", "", "2026-02-31T00:00:00.000Z", "2026-13-01T00:00:00.000Z", "2026-09-10T25:00:00.000Z"])(
    "повертає помилку на рядку, що не є ISO-8601 UTC: %j",
    (value) => {
      writeFileSync(statePath, JSON.stringify({ lastSyncedAt: value }));

      expect(loadState(statePath).ok).toBe(false);
    },
  );
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

  // Запис іде через тимчасовий файл і rename, тож невдала спроба не має ні обрізати
  // наявний checkpoint, ні лишати по собі сміття.
  it("не псує наявний стан і не лишає тимчасових файлів, якщо запис не вдався", () => {
    writeFileSync(statePath, JSON.stringify({ lastSyncedAt: "2026-09-09T23:55:00.000Z" }));
    const target = join(dir, "sub");
    mkdirSync(target);

    const saved = saveState(target, { lastSyncedAt: "2026-09-10T08:00:00.000Z" });

    expect(saved.ok).toBe(false);
    expect(loadState(statePath)).toEqual({ ok: true, value: { lastSyncedAt: "2026-09-09T23:55:00.000Z" } });
    expect(readdirSync(dir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});
