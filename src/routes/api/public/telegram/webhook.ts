import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { telegramWebhookSecret, safeEqual } = await import("@/lib/telegram.server");

        const expected = await telegramWebhookSecret();
        const received = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(received, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = (await request.json()) as {
          update_id?: number;
          message?: TgMessage;
          edited_message?: TgMessage;
        };
        const message = update.message ?? update.edited_message;
        if (!message?.chat?.id || typeof update.update_id !== "number") {
          return Response.json({ ok: true, ignored: true });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const chatId = message.chat.id;
        const texto = message.text ?? "";
        const autor =
          [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") ||
          message.from?.username ||
          "Telegram";

        // Vinculação por QR Code: /start <token>
        const startMatch = texto.match(/^\/start\s+([A-Za-z0-9]{8,64})$/);
        if (startMatch) {
          const token = startMatch[1];
          const { data: vinculo } = await supabaseAdmin
            .from("telegram_vinculos")
            .select("user_id")
            .eq("token", token)
            .maybeSingle();

          if (!vinculo) {
            await sendMessage(chatId, "Código de vínculo inválido ou expirado. Gere um novo QR Code no sistema.");
            return Response.json({ ok: true });
          }

          // Solta o chat de qualquer outro vínculo antes de reatribuir.
          await supabaseAdmin
            .from("telegram_vinculos")
            .update({ chat_id: null, vinculado_em: null })
            .eq("chat_id", chatId)
            .neq("user_id", vinculo.user_id);

          await supabaseAdmin
            .from("telegram_vinculos")
            .update({
              chat_id: chatId,
              telegram_username: message.from?.username ?? null,
              telegram_nome: autor,
              vinculado_em: new Date().toISOString(),
            })
            .eq("user_id", vinculo.user_id);

          await sendMessage(chatId, "✅ Telegram vinculado ao sistema Unifique Comercial. Suas mensagens aparecem no chat do sistema.");
          return Response.json({ ok: true, linked: true });
        }

        const { data: dono } = await supabaseAdmin
          .from("telegram_vinculos")
          .select("user_id")
          .eq("chat_id", chatId)
          .maybeSingle();

        // Chats não vinculados (clientes, contatos externos, grupos) caem na
        // caixa de entrada do gestor regional/admin para não se perderem.
        let ownerId = dono?.user_id ?? null;
        if (!ownerId) {
          const { data: gestor } = await supabaseAdmin
            .from("user_roles")
            .select("user_id")
            .in("role", ["regional", "admin"])
            .limit(1)
            .maybeSingle();
          ownerId = gestor?.user_id ?? null;
        }

        if (!ownerId) {
          await sendMessage(chatId, "Sistema Unifique Comercial ainda não configurado. Tente novamente mais tarde.");
          return Response.json({ ok: true, unlinked: true });
        }

        const { error } = await supabaseAdmin.from("telegram_mensagens").upsert(
          {
            user_id: ownerId,
            chat_id: chatId,
            direcao: "entrada",
            texto: texto || "[mensagem sem texto]",
            autor,
            update_id: update.update_id,
          },
          { onConflict: "update_id" },
        );
        if (error) return Response.json({ error: error.message }, { status: 500 });


        return Response.json({ ok: true });
      },
    },
  },
});

type TgMessage = {
  chat?: { id?: number };
  text?: string;
  from?: { username?: string; first_name?: string; last_name?: string };
};

async function sendMessage(chatId: number, text: string) {
  const { telegramCall } = await import("@/lib/telegram.server");
  try {
    await telegramCall("sendMessage", { chat_id: chatId, text });
  } catch (error) {
    console.error("Falha ao responder no Telegram:", error);
  }
}
