const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

export const BOT_USERNAME = "UnifiqueRN_Bot";

function requireKeys() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY não configurada");
  const telegramKey = process.env.TELEGRAM_API_KEY;
  if (!telegramKey) throw new Error("TELEGRAM_API_KEY não configurada");
  return { lovableKey, telegramKey };
}

export async function telegramCall<T = unknown>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { lovableKey, telegramKey } = requireKeys();
  const response = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`Telegram ${method} falhou [${response.status}]: ${text}`);
    throw new Error(`Telegram ${method} falhou [${response.status}]: ${text}`);
  }
  const json = JSON.parse(text) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) {
    console.error(`Telegram ${method} retornou erro: ${json.description}`);
    throw new Error(json.description ?? `Telegram ${method} retornou erro`);
  }
  return json.result as T;
}

/** Segredo compartilhado entre o setWebhook e o endpoint público. */
export async function telegramWebhookSecret(): Promise<string> {
  const { telegramKey } = requireKeys();
  const bytes = new TextEncoder().encode(`telegram-webhook:${telegramKey}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
