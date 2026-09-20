// Notification about a new lead to the managers' Telegram chat (Bot API sendMessage).
import { readEnv } from "../core/config.js";
import { postJson } from "../core/http.js";
import { log } from "../core/log.js";
import { isRecord, isString, parseJson } from "../core/parse.js";
import type { Integration, Lead, Result } from "../core/types.js";

/** Bot API response: `ok: false` comes along with `description`. */
interface TelegramResponse {
  ok: boolean;
  description?: string;
}

const isTelegramResponse = (value: unknown): value is TelegramResponse =>
  isRecord(value) &&
  typeof value.ok === "boolean" &&
  (value.description === undefined || isString(value.description));

/** Notification: only name, source, and budgetUsd — no email or phone. */
export function formatTelegramMessage(lead: Lead): string {
  const budget = lead.budgetUsd === undefined ? "бюджет не вказано" : `бюджет $${lead.budgetUsd}`;
  return `Новий лід: ${lead.name} · ${lead.source} · ${budget}`;
}

export const telegramNotify: Integration = {
  name: "telegram-notify",
  requiredEnv: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],

  async send(lead: Lead): Promise<Result<void>> {
    const botToken = readEnv("TELEGRAM_BOT_TOKEN");
    if (!botToken.ok) return botToken;
    const chatId = readEnv("TELEGRAM_CHAT_ID");
    if (!chatId.ok) return chatId;

    const url = `https://api.telegram.org/bot${botToken.value}/sendMessage`;
    const response = await postJson(url, {
      chat_id: chatId.value,
      text: formatTelegramMessage(lead),
    });
    if (!response.ok) {
      log.error(`telegram-notify: lead ${lead.id} not delivered: ${response.error}`);
      return response;
    }

    const data = parseJson(response.value, isTelegramResponse, "telegram-notify");
    if (!data.ok) {
      log.error(`telegram-notify: lead ${lead.id} not delivered: ${data.error}`);
      return data;
    }

    if (!data.value.ok) {
      const description = data.value.description ?? "unknown error";
      log.error(`telegram-notify: lead ${lead.id} not delivered: ${description}`);
      return { ok: false, error: `telegram error: ${description}` };
    }

    log.info(`telegram-notify: lead ${lead.id} delivered`);
    return { ok: true, value: undefined };
  },
};
