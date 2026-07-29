// Server-only: fala com o serviço ponte MTProto externo.
// Ver docs/telegram-mtproto-bridge.md para a especificação completa.

export type BridgeConfig = { url: string; secret: string };

export function getBridgeConfig(): BridgeConfig | null {
  const url = process.env.TELEGRAM_BRIDGE_URL;
  const secret = process.env.TELEGRAM_BRIDGE_SECRET;
  if (!url || !secret) return null;
  return { url: url.replace(/\/+$/, ""), secret };
}

export async function bridgeCall<T>(
  path: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const cfg = getBridgeConfig();
  if (!cfg) throw new Error("Serviço de Telegram pessoal não configurado.");

  let res: Response;
  try {
    res = await fetch(`${cfg.url}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bridge-Secret": cfg.secret,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Não foi possível contatar o serviço de Telegram. Tente novamente.");
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Falha no serviço de Telegram (${res.status}).`;
    console.error(`[tg-bridge] ${path} -> ${res.status}`);
    throw new Error(msg);
  }

  return body as T;
}
