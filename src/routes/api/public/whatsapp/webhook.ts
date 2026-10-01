import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhookRequest } from "@lovable.dev/webhooks-js";

type SupabaseAdmin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

const STATUS_ORDER = ["accepted", "sent", "delivered", "read"] as const;

function digits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/** Encontra o vendedor dono da conversa pelo telefone (lead ou venda). Fallback: primeiro admin. */
async function acharVendedor(admin: SupabaseAdmin, telefone: string): Promise<string | null> {
  const d = digits(telefone);
  const curto = d.length > 11 ? d.slice(-11) : d;
  const { data: lead } = await admin
    .from("leads")
    .select("vendedor_id")
    .not("whatsapp", "is", null)
    .ilike("whatsapp", `%${curto}%`)
    .limit(1)
    .maybeSingle();
  if (lead?.vendedor_id) return lead.vendedor_id;

  const { data: vendaPap } = await admin
    .from("vendas_pap")
    .select("vendedor_id")
    .not("telefone", "is", null)
    .ilike("telefone", `%${curto}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (vendaPap?.vendedor_id) return vendaPap.vendedor_id;

  const { data: vendaLoja } = await admin
    .from("vendas_loja")
    .select("vendedor_id")
    .not("telefone", "is", null)
    .ilike("telefone", `%${curto}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (vendaLoja?.vendedor_id) return vendaLoja.vendedor_id;

  const { data: adminRole } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  return adminRole?.user_id ?? null;
}

async function processarEvento(admin: SupabaseAdmin, event: string, payload: any) {
  const value = payload?.entry?.[0]?.changes?.[0]?.value;
  if (!value) return;

  if (event === "whatsapp.message") {
    const contato = value.contacts?.[0];
    for (const msg of value.messages ?? []) {
      const telefone = digits(msg.from);
      if (!telefone || !msg.id) continue;

      const vendedorId = await acharVendedor(admin, telefone);
      if (!vendedorId) throw new Error(`Nenhum usuário para atribuir a conversa ${telefone}`);

      const texto =
        msg.text?.body ??
        msg[msg.type]?.caption ??
        (msg.type === "text" ? null : `[${msg.type}]`);
      const mediaId = msg[msg.type]?.id ?? null;

      const { data: conv, error: convErr } = await admin
        .from("whatsapp_conversations")
        .upsert(
          {
            vendedor_id: vendedorId,
            telefone,
            nome_contato: contato?.profile?.name ?? null,
            ultima_mensagem: texto,
            ultima_mensagem_em: new Date(Number(msg.timestamp) * 1000).toISOString(),
          },
          { onConflict: "vendedor_id,telefone" },
        )
        .select("id")
        .single();
      if (convErr) throw convErr;

      const { error: msgErr } = await admin.from("whatsapp_messages").upsert(
        {
          conversation_id: conv.id,
          provider_message_id: msg.id,
          direcao: "recebida",
          tipo: msg.type === "text" ? "texto" : msg.type,
          conteudo: texto,
          media_id: mediaId,
          status: "delivered",
          enviada_em: new Date(Number(msg.timestamp) * 1000).toISOString(),
        },
        { onConflict: "conversation_id,provider_message_id" },
      );
      if (msgErr) throw msgErr;

      const { data: atual } = await admin
        .from("whatsapp_conversations")
        .select("nao_lidas")
        .eq("id", conv.id)
        .single();
      await admin
        .from("whatsapp_conversations")
        .update({ nao_lidas: (atual?.nao_lidas ?? 0) + 1 })
        .eq("id", conv.id);
    }
    return;
  }

  if (event === "whatsapp.status") {
    for (const st of value.statuses ?? []) {
      if (!st.id) continue;
      const { data: msg } = await admin
        .from("whatsapp_messages")
        .select("id, status, conversation_id")
        .eq("provider_message_id", st.id)
        .maybeSingle();
      if (!msg) continue; // callback chegou antes do registro de envio: fica pendente p/ reconciliação
      const atualIdx = STATUS_ORDER.indexOf(msg.status as (typeof STATUS_ORDER)[number]);
      const novoIdx = STATUS_ORDER.indexOf(st.status);
      // nunca regride delivered/read; failed e timestamps sempre atualizam
      const novoStatus =
        st.status === "failed" ? "failed" : novoIdx > atualIdx ? st.status : msg.status;
      await admin
        .from("whatsapp_messages")
        .update({
          status: novoStatus,
          erro: st.errors?.[0] ? JSON.stringify(st.errors[0]) : null,
          enviada_em: st.timestamp
            ? new Date(Number(st.timestamp) * 1000).toISOString()
            : undefined,
        })
        .eq("id", msg.id);
    }
    return;
  }

  // demais eventos (message_error, template_status, etc.) ficam apenas registrados na inbox
}

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.WHATSAPP_API_KEY;
        if (!secret) {
          console.error("WHATSAPP_API_KEY não configurada");
          return new Response("not configured", { status: 500 });
        }

        let body: string;
        try {
          const verified = await verifyWebhookRequest({
            req: request.clone(),
            secret,
            maxBodyBytes: 4 * 1024 * 1024,
          });
          body = verified.body;
        } catch (e) {
          console.error("Assinatura inválida no webhook WhatsApp:", e);
          return new Response("invalid signature", { status: 401 });
        }

        const deliveryId = request.headers.get("x-lovable-delivery");
        const event = request.headers.get("x-lovable-event");
        if (!deliveryId || !event) return new Response("missing headers", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: row, error: insErr } = await supabaseAdmin
          .from("whatsapp_webhook_events")
          .upsert(
            { delivery_id: deliveryId, event, payload: JSON.parse(body) },
            { onConflict: "delivery_id" },
          )
          .select("id, processed_at")
          .single();
        if (insErr) {
          console.error("Falha ao gravar evento do webhook:", insErr);
          return new Response("db error", { status: 500 });
        }
        if (row.processed_at) return new Response("ok"); // já processado (entrega duplicada)

        try {
          await processarEvento(supabaseAdmin, event, JSON.parse(body));
          await supabaseAdmin
            .from("whatsapp_webhook_events")
            .update({ processed_at: new Date().toISOString(), processing_error: null })
            .eq("id", row.id);
          return new Response("ok");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("Falha ao processar evento WhatsApp:", msg);
          await supabaseAdmin
            .from("whatsapp_webhook_events")
            .update({ processing_error: msg })
            .eq("id", row.id);
          return new Response("processing error", { status: 500 });
        }
      },
    },
  },
});
