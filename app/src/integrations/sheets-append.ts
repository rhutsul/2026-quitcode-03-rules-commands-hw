// Рядок у Google Sheet на кожен лід. Перенесено з експорту n8n-воркфлоу
// «Leads → Google Sheets» (2024), приведено до конвенцій проєкту.
import { readEnv } from "../core/config.js";
import { postJson } from "../core/http.js";
import { log } from "../core/log.js";
import { isRecord, isString, parseJson } from "../core/parse.js";
import type { Integration, Lead, Result } from "../core/types.js";

interface SheetsResponse {
  status: string;
}

const isSheetsResponse = (value: unknown): value is SheetsResponse =>
  isRecord(value) && isString(value.status);

const sheetsAppend: Integration = {
  name: "sheets-append",
  requiredEnv: ["SHEETS_WEBHOOK_URL", "SHEETS_TOKEN"],

  async send(lead: Lead): Promise<Result<void>> {
    const webhookUrl = readEnv("SHEETS_WEBHOOK_URL");
    if (!webhookUrl.ok) return webhookUrl;
    const token = readEnv("SHEETS_TOKEN");
    if (!token.ok) return token;

    const url = `${webhookUrl.value}?token=${token.value}`;
    const response = await postJson(url, {
      values: [[lead.createdAt, lead.name, lead.email, lead.phone ?? "", lead.source]],
    });
    if (!response.ok) {
      log.error(`sheets-append failed: ${url} -> ${response.error}`);
      return response;
    }

    const data = parseJson(response.value, isSheetsResponse, "sheets-append");
    if (!data.ok) {
      log.error(`sheets-append failed: ${url} -> ${data.error}`);
      return data;
    }

    if (data.value.status !== "ok") {
      log.error(`sheets-append failed: ${url} -> ${data.value.status}`);
      return { ok: false, error: `sheets error: ${data.value.status}` };
    }

    log.info(`sheets-append: row added for lead ${lead.id}`);
    return { ok: true, value: undefined };
  },
};

export default sheetsAppend;
