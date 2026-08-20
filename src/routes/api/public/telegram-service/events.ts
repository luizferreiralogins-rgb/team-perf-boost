import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

type Payload = {
  crmUserId: string;
  account?: Record<string, unknown>;
  contacts?: Record<string, unknown>[];
  chats?: Record<string, unknown>[];
  messages?: Record<string, unknown>[];
};

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const Route = createFileRoute("/api/public/telegram-service/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["TELEGRAM_SERVICE_WEBHOOK_SECRET"];
        if (!secret) return new Response("Not configured", { status: 503 });

        const raw = await request.text();
        const signature = request.headers.get("x-telegram-service-signature") ?? "";
        const expected = createHmac("sha256", secret).update(raw).digest("hex");
        if (!safeEqual(signature, expected)) return new Response("Invalid signature", { status: 401 });

        let payload: Payload;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        if (!payload?.crmUserId) return new Response("Missing crmUserId", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: account, error: accErr } = await supabaseAdmin
          .from("telegram_accounts")
          .upsert(
            { crm_user_id: payload.crmUserId, ...(payload.account ?? {}) } as never,
            { onConflict: "crm_user_id" },
          )
          .select("id")
          .single();
        if (accErr) return Response.json({ error: accErr.message }, { status: 500 });

        const accountId = account.id;

        if (payload.contacts?.length) {
          const { error } = await supabaseAdmin
            .from("telegram_contacts")
            .upsert(
              payload.contacts.map((c) => ({ ...c, telegram_account_id: accountId })) as never,
              { onConflict: "telegram_account_id,telegram_user_id" },
            );
          if (error) return Response.json({ error: error.message }, { status: 500 });
        }

        if (payload.chats?.length) {
          const { error } = await supabaseAdmin
            .from("telegram_chats")
            .upsert(
              payload.chats.map((c) => ({ ...c, telegram_account_id: accountId })) as never,
              { onConflict: "telegram_account_id,telegram_chat_id" },
            );
          if (error) return Response.json({ error: error.message }, { status: 500 });
        }

        if (payload.messages?.length) {
          const telegramChatIds = [
            ...new Set(payload.messages.map((m) => Number(m["telegram_chat_id"]))),
          ];
          const { data: chatRows } = await supabaseAdmin
            .from("telegram_chats")
            .select("id, telegram_chat_id")
            .eq("telegram_account_id", accountId)
            .in("telegram_chat_id", telegramChatIds);
          const map = new Map((chatRows ?? []).map((c) => [Number(c.telegram_chat_id), c.id]));

          const rows = payload.messages
            .map((m) => {
              const chatId = map.get(Number(m["telegram_chat_id"]));
              return chatId ? { ...m, chat_id: chatId } : null;
            })
            .filter(Boolean);

          if (rows.length) {
            const { error } = await supabaseAdmin
              .from("telegram_messages")
              .upsert(rows as never, { onConflict: "telegram_chat_id,telegram_message_id" });
            if (error) return Response.json({ error: error.message }, { status: 500 });
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
