/**
 * Cliente HTTP do Telegram Service (processo externo que roda TDLib/MTProto).
 * Server-only: nunca importar isto de componentes ou rotas do cliente.
 */

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export function serviceConfig() {
  const url = process.env["TELEGRAM_SERVICE_URL"];
  const token = process.env["TELEGRAM_SERVICE_TOKEN"];
  return { url, token, configured: Boolean(url && token) };
}

export const SERVICE_NOT_CONFIGURED =
  "O Telegram Service ainda não está configurado. Hospede o serviço TDLib e cadastre TELEGRAM_SERVICE_URL e TELEGRAM_SERVICE_TOKEN.";

export async function callService<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<ServiceResult<T>> {
  const { url, token, configured } = serviceConfig();
  if (!configured) return { ok: false, error: SERVICE_NOT_CONFIGURED, code: "not_configured" };

  try {
    const res = await fetch(`${url!.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      const msg =
        (parsed as { error?: string } | null)?.error ?? `Telegram Service respondeu ${res.status}`;
      console.error(`[telegram-service] ${path} -> ${res.status}: ${text}`);
      return { ok: false, error: msg, code: String(res.status) };
    }
    return { ok: true, data: parsed as T };
  } catch (err) {
    console.error(`[telegram-service] falha de rede em ${path}`, err);
    return { ok: false, error: "Não foi possível falar com o Telegram Service.", code: "network" };
  }
}
