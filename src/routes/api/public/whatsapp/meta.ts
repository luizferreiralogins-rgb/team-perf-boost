import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

// Webhook direto da Meta para contas de WhatsApp Business conectadas por cada usuário.
export const Route = createFileRoute("/api/public/whatsapp/meta")({
  server: {
    handlers: {
      // Verificação do webhook (Meta envia hub.verify_token)
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const token = u.searchParams.get("hub.verify_token") ?? "";
        const challenge = u.searchParams.get("hub.challenge") ?? "";
        if (u.searchParams.get("hub.mode") !== "subscribe" || !/^[a-f0-9]{32}$/.test(token))
          return new Response("forbidden", { status: 403 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("whatsapp_contas" as any)
          .select("user_id")
          .eq("verify_token", token)
          .maybeSingle();
        if (!data) return new Response("forbidden", { status: 403 });
        return new Response(challenge, { status: 200 });
      },
      POST: async ({ request }) => {
        const body = await request.text();
        if (body.length > 4 * 1024 * 1024) return new Response("too large", { status: 413 });
        let payload: any;
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("bad json", { status: 400 });
        }
        const assinatura = request.headers.get("x-hub-signature-256") ?? "";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { decrypt } = await import("@/lib/whatsapp-crypto.server");
        const { processarEvento } = await import("./webhook");

        for (const entry of payload?.entry ?? []) {
          for (const change of entry?.changes ?? []) {
            const value = change?.value;
            const phoneId = value?.metadata?.phone_number_id;
            if (!phoneId) continue;
            const { data: conta } = await supabaseAdmin
              .from("whatsapp_contas" as any)
              .select("user_id, app_secret_enc")
              .eq("phone_number_id", String(phoneId))
              .maybeSingle();
            if (!conta) continue;
            const c = conta as any;
            const esperado =
              "sha256=" + createHmac("sha256", decrypt(c.app_secret_enc)).update(body).digest("hex");
            const a = Buffer.from(assinatura);
            const b = Buffer.from(esperado);
            if (a.length !== b.length || !timingSafeEqual(a, b))
              return new Response("invalid signature", { status: 401 });

            const unico = { entry: [{ changes: [{ value }] }] };
            try {
              if (value.messages?.length)
                await processarEvento(supabaseAdmin, "whatsapp.message", unico, c.user_id);
              if (value.statuses?.length)
                await processarEvento(supabaseAdmin, "whatsapp.status", unico, c.user_id);
            } catch (e) {
              console.error("Falha ao processar webhook Meta:", e);
              return new Response("processing error", { status: 500 });
            }
          }
        }
        return new Response("ok");
      },
    },
  },
});
