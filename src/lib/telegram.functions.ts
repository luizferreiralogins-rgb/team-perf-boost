import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TelegramStatus =
  | "desconectado"
  | "aguardando_qr"
  | "qr_lido"
  | "aguardando_2fa"
  | "conectado"
  | "erro";

export type QrState = {
  status: TelegramStatus;
  qrUrl?: string | null;
  expiresAt?: string | null;
  error?: string | null;
  account?: {
    telegram_user_id: number | null;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

export const telegramServiceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { serviceConfig } = await import("./telegram.server");
    return { configured: serviceConfig().configured };
  });

export const startQrLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QrState & { serviceError?: string }> => {
    const { callService } = await import("./telegram.server");
    const res = await callService<QrState>("/sessions/qr/start", { crmUserId: context.userId });
    if (!res.ok) return { status: "erro", error: res.error, serviceError: res.error };
    return res.data;
  });

export const pollQrLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QrState & { serviceError?: string }> => {
    const { callService } = await import("./telegram.server");
    const res = await callService<QrState>("/sessions/qr/poll", { crmUserId: context.userId });
    if (!res.ok) return { status: "erro", error: res.error, serviceError: res.error };
    return res.data;
  });

export const submit2faPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { password: string }) => {
    if (!input?.password || input.password.length < 1) throw new Error("Informe a senha 2FA.");
    return { password: input.password };
  })
  .handler(async ({ data, context }): Promise<QrState> => {
    const { callService } = await import("./telegram.server");
    // A senha 2FA é repassada ao serviço e nunca persistida.
    const res = await callService<QrState>("/sessions/qr/2fa", {
      crmUserId: context.userId,
      password: data.password,
    });
    if (!res.ok) return { status: "erro", error: res.error };
    return res.data;
  });

export const syncTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { callService } = await import("./telegram.server");
    const res = await callService<{ chats: number; contacts: number }>("/sync", {
      crmUserId: context.userId,
    });
    if (!res.ok) throw new Error(res.error);
    return res.data;
  });

export const loadOlderMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { chatId: string; beforeMessageId?: number | null }) => ({
    chatId: String(input.chatId),
    beforeMessageId: input.beforeMessageId ?? null,
  }))
  .handler(async ({ data, context }) => {
    const { callService } = await import("./telegram.server");
    const res = await callService<{ fetched: number }>("/history", {
      crmUserId: context.userId,
      chatId: data.chatId,
      beforeMessageId: data.beforeMessageId,
    });
    if (!res.ok) throw new Error(res.error);
    return res.data;
  });

export const sendTelegramMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { chatId: string; text: string }) => {
    const text = (input?.text ?? "").trim();
    if (!input?.chatId) throw new Error("Conversa inválida.");
    if (!text) throw new Error("Mensagem vazia.");
    if (text.length > 4096) throw new Error("Mensagem muito longa.");
    return { chatId: String(input.chatId), text };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // A conversa precisa pertencer ao usuário autenticado (RLS garante o escopo).
    const { data: chat, error } = await supabase
      .from("telegram_chats")
      .select("id, telegram_chat_id, telegram_account_id")
      .eq("id", data.chatId)
      .maybeSingle();
    if (error) throw error;
    if (!chat) throw new Error("Conversa não encontrada.");

    const { callService } = await import("./telegram.server");
    const res = await callService<{ telegram_message_id: number; sent_at: string }>("/messages/send", {
      crmUserId: userId,
      chatId: chat.id,
      telegramChatId: chat.telegram_chat_id,
      text: data.text,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!res.ok) {
      await supabaseAdmin.from("telegram_messages").insert({
        chat_id: chat.id,
        telegram_chat_id: chat.telegram_chat_id,
        direction: "out",
        message_type: "text",
        content: data.text,
        status: "falhou",
      });
      throw new Error(res.error);
    }

    await supabaseAdmin.from("telegram_messages").upsert(
      {
        chat_id: chat.id,
        telegram_chat_id: chat.telegram_chat_id,
        telegram_message_id: res.data.telegram_message_id,
        direction: "out",
        message_type: "text",
        content: data.text,
        status: "enviada",
        sent_at: res.data.sent_at,
      },
      { onConflict: "telegram_chat_id,telegram_message_id" },
    );
    await supabaseAdmin
      .from("telegram_chats")
      .update({
        last_message_id: res.data.telegram_message_id,
        last_message_text: data.text,
        last_message_at: res.data.sent_at,
      })
      .eq("id", chat.id);

    return { ok: true as const };
  });

export const disconnectTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { callService } = await import("./telegram.server");
    const res = await callService<{ ok: boolean }>("/sessions/disconnect", {
      crmUserId: context.userId,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("telegram_accounts")
      .update({
        status: "desconectado",
        session_reference: null,
        last_error: res.ok ? null : res.error,
      })
      .eq("crm_user_id", context.userId);

    if (!res.ok && res.code !== "not_configured") throw new Error(res.error);
    return { ok: true as const };
  });
