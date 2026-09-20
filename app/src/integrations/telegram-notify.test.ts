import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "../core/types.js";
import { formatTelegramMessage, telegramNotify } from "./telegram-notify.js";

const BOT_TOKEN = "1234567890:AAFfake-token-for-tests-000000000000";
const CHAT_ID = "-1000000000001";

const lead: Lead = {
  id: "ld_0003",
  name: "Марія Тестова",
  email: "mariia@studio-nova.example.test",
  phone: "+380 (00) 000-00-01",
  source: "referral",
  budgetUsd: 2500,
  createdAt: "2026-09-10T10:15:00.000Z",
};

beforeEach(() => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
  vi.stubEnv("TELEGRAM_CHAT_ID", CHAT_ID);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("telegram-notify", () => {
  it("форматує повідомлення без email і телефону", () => {
    const text = formatTelegramMessage(lead);
    expect(text).toContain("Марія Тестова");
    expect(text).toContain("referral");
    expect(text).not.toContain(lead.email);
    expect(text).not.toContain("+380");
  });

  it("надсилає повідомлення в чат і повертає ok", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{"ok":true,"result":{"message_id":1}}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(telegramNotify.send(lead)).resolves.toEqual({ ok: true, value: undefined });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`);
    expect(JSON.parse(String(init?.body))).toEqual({
      chat_id: CHAT_ID,
      text: formatTelegramMessage(lead),
    });
  });

  it("повертає помилку, якщо не задано TELEGRAM_CHAT_ID", async () => {
    vi.stubEnv("TELEGRAM_CHAT_ID", "");
    await expect(telegramNotify.send(lead)).resolves.toEqual({
      ok: false,
      error: "missing environment variable TELEGRAM_CHAT_ID",
    });
  });

  it("повертає помилку, якщо Bot API відповів ok:false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"ok":false,"description":"chat not found"}', { status: 200 })));

    await expect(telegramNotify.send(lead)).resolves.toEqual({
      ok: false,
      error: "telegram error: chat not found",
    });
  });
});
