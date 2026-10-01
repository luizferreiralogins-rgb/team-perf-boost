import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/whatsapp";

function digits(v: string): string {
  return v.replace(/\D/g, "");
}

async function enviarViaContaPropria(userId: string, to: string, texto: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: conta } = await supabaseAdmin
    .from("whatsapp_contas" as any)
    .select("phone_number_id, access_token_enc")
    .eq("user_id", userId)
    .maybeSingle();
  if (!conta) return null;
  const { decrypt, GRAPH_URL } = await import("./whatsapp-crypto.server");
  const c = conta as any;
  const response = await fetch(`${GRAPH_URL}/${c.phone_number_id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${decrypt(c.access_token_enc)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: texto } }),
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(`WhatsApp (conta própria) falhou [${response.status}]: ${body}`);
    throw new Error(`Falha ao enviar mensagem (${response.status}): ${body}`);
  }
  return JSON.parse(body) as { messages?: { id: string }[] };
}

async function enviarViaGateway(to: string, texto: string) {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");
  if (!WHATSAPP_API_KEY)
    throw new Error("WhatsApp ainda não está conectado. Conclua a conexão nas integrações.");

  const response = await fetch(`${GATEWAY_URL}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": WHATSAPP_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: texto },
    }),
  });
  const responseBody = await response.text();
  if (!response.ok) {
    console.error(`WhatsApp send failed [${response.status}]: ${responseBody}`);
    throw new Error(`Falha ao enviar mensagem (${response.status}): ${responseBody}`);
  }
  return JSON.parse(responseBody) as { messages?: { id: string }[] };
}

export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        telefone: z.string().min(10).max(20),
        texto: z.string().trim().min(1).max(4000),
        nomeContato: z.string().max(200).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const telefone = digits(data.telefone);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // conversa do próprio usuário (ou cria)
    const { data: conv, error: convErr } = await supabaseAdmin
      .from("whatsapp_conversations")
      .upsert(
        {
          vendedor_id: context.userId,
          telefone,
          nome_contato: data.nomeContato ?? null,
          ultima_mensagem: data.texto,
          ultima_mensagem_em: new Date().toISOString(),
        },
        { onConflict: "vendedor_id,telefone" },
      )
      .select("id")
      .single();
    if (convErr) throw convErr;

    // registra como "enviando" antes da chamada, para reconciliar callbacks que chegarem cedo
    const { data: msgRow, error: msgErr } = await supabaseAdmin
      .from("whatsapp_messages")
      .insert({
        conversation_id: conv.id,
        direcao: "enviada",
        tipo: "texto",
        conteudo: data.texto,
        status: "accepted",
        enviada_em: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (msgErr) throw msgErr;

    try {
      const resp =
        (await enviarViaContaPropria(context.userId, telefone, data.texto)) ??
        (await enviarViaGateway(telefone, data.texto));
      const providerId = resp.messages?.[0]?.id ?? null;
      await supabaseAdmin
        .from("whatsapp_messages")
        .update({ provider_message_id: providerId, status: "sent" })
        .eq("id", msgRow.id);

      // reconcilia callbacks de status que chegaram antes do provider_message_id ser salvo
      if (providerId) {
        const { data: pendentes } = await supabaseAdmin
          .from("whatsapp_webhook_events")
          .select("id, payload")
          .eq("event", "whatsapp.status")
          .is("processed_at", null)
          .limit(50);
        for (const ev of pendentes ?? []) {
          const statuses = (ev.payload as any)?.entry?.[0]?.changes?.[0]?.value?.statuses ?? [];
          if (statuses.some((s: any) => s?.id === providerId)) {
            const melhor = statuses.find((s: any) => s?.id === providerId);
            await supabaseAdmin
              .from("whatsapp_messages")
              .update({ status: melhor.status === "failed" ? "failed" : melhor.status })
              .eq("id", msgRow.id);
            await supabaseAdmin
              .from("whatsapp_webhook_events")
              .update({ processed_at: new Date().toISOString() })
              .eq("id", ev.id);
          }
        }
      }
      return { ok: true, messageId: msgRow.id };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("whatsapp_messages")
        .update({ status: "failed", erro: msg })
        .eq("id", msgRow.id);
      throw e;
    }
  });

export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ conversationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("whatsapp_conversations")
      .update({ nao_lidas: 0 })
      .eq("id", data.conversationId);
    return { ok: true };
  });

export const whatsappConfigurado = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("whatsapp_contas" as any)
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { configurado: Boolean(data) || Boolean(process.env.WHATSAPP_API_KEY), contaPropria: Boolean(data) };
  });

export const minhaContaWhatsapp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("whatsapp_contas" as any)
      .select("phone_number_id, numero_exibicao, verify_token, updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    return (data as any) as
      | { phone_number_id: string; numero_exibicao: string | null; verify_token: string; updated_at: string }
      | null;
  });

export const salvarContaWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        phoneNumberId: z.string().trim().regex(/^\d{5,30}$/, "ID do número inválido"),
        accessToken: z.string().trim().min(20).max(1000),
        appSecret: z.string().trim().min(16).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { GRAPH_URL, encrypt } = await import("./whatsapp-crypto.server");
    // valida as credenciais na Meta
    const r = await fetch(
      `${GRAPH_URL}/${data.phoneNumberId}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${data.accessToken}` } },
    );
    const txt = await r.text();
    if (!r.ok) throw new Error(`A Meta recusou os dados informados (${r.status}): ${txt}`);
    const info = JSON.parse(txt) as { display_phone_number?: string };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("whatsapp_contas" as any).upsert(
      {
        user_id: context.userId,
        phone_number_id: data.phoneNumberId,
        numero_exibicao: info.display_phone_number ?? null,
        access_token_enc: encrypt(data.accessToken),
        app_secret_enc: encrypt(data.appSecret),
      } as any,
      { onConflict: "user_id" },
    );
    if (error) {
      if (error.code === "23505") throw new Error("Esse número já está conectado por outro usuário.");
      throw error;
    }
    return { ok: true, numero: info.display_phone_number ?? null };
  });

export const removerContaWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("whatsapp_contas" as any).delete().eq("user_id", context.userId);
    return { ok: true };
  });
