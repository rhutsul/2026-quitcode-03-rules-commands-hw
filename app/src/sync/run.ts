// Один запуск синхронізації. Планувальник викликає його кожні 5 хвилин.
import { log } from "../core/log.js";
import type { Integration, Lead } from "../core/types.js";
import { loadState, saveState } from "./state.js";

export interface SyncReport {
  pending: number;
  delivered: number;
  failed: number;
  /**
   * Whether the new checkpoint reached disk. `false` means the leads of this run were
   * delivered but the progress was not recorded, so the next run will send them again —
   * the caller has to see that, not just find it in the log.
   */
  progressSaved: boolean;
}

const EMPTY_REPORT: SyncReport = { pending: 0, delivered: 0, failed: 0, progressSaved: false };

export async function runSync(
  leads: readonly Lead[],
  integrations: readonly Integration[],
  statePath: string,
): Promise<SyncReport> {
  const state = loadState(statePath);
  if (!state.ok) {
    // Нечитний стан — це не привід вважати, що нічого не синхронізовано: так один
    // обірваний запис коштував дев'яти годин повторної розсилки. Пропускаємо прогін,
    // лишаємо файл як є і даємо людині побачити помилку.
    log.error(`sync: ${state.error}; run skipped, state file left untouched`);
    return { ...EMPTY_REPORT };
  }

  const created = saveState(statePath, state.value); // створює файл стану при першому запуску
  if (!created.ok) {
    log.error(`sync: ${created.error}; run skipped`);
    return { ...EMPTY_REPORT };
  }

  const pending = leads.filter((lead) => lead.createdAt > state.value.lastSyncedAt);
  let delivered = 0;
  let failed = 0;

  for (const lead of pending) {
    for (const integration of integrations) {
      const result = await integration.send(lead);
      if (result.ok) delivered++;
      else failed++;
    }
  }

  const newest = pending.reduce(
    (latest, lead) => (lead.createdAt > latest ? lead.createdAt : latest),
    state.value.lastSyncedAt,
  );
  const saved = saveState(statePath, { lastSyncedAt: newest });
  if (!saved.ok) {
    log.error(`sync: ${saved.error}; progress not recorded — the next run will resend these leads`);
  }

  log.info(`sync: ${pending.length} pending leads, ${delivered} delivered, ${failed} failed`);
  return { pending: pending.length, delivered, failed, progressSaved: saved.ok };
}
