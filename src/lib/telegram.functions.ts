import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TelegramStatus = {
  vinculado: boolean;
  token: string;
  deepLink: string;
  botUsername: string;
  telegramUsername: string | null;
  telegramNome: string | null;
  vinculadoEm: string | null;
};

export type TelegramMensagem = {
  id: string;
  chat_id: number;
  direcao: "entrada" | "saida";
  texto: string | null;
  autor: string | null;
  created_at: string;
};

export type TelegramConversa = {
  chat_id: number;
  titulo: string;
  ultima: string | null;
  ultimaEm: string;
};


function novoToken() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}

export const getTelegramStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TelegramStatus> => {
    const { BOT_USERNAME } = await import("@/lib/telegram.server");
    const { supabase, userId } = context;

    let { data } = await supabase
      .from("telegram_vinculos")
      .select("token, chat_id, telegram_username, telegram_nome, vinculado_em")
      .eq("user_id", userId)
      .maybeSingle();

    if (!data) {
      const { data: created, error } = await supabase
        .from("telegram_vinculos")
        .insert({ user_id: userId, token: novoToken() })
        .select("token, chat_id, telegram_username, telegram_nome, vinculado_em")
        .single();
      if (error) throw new Error(error.message);
      data = created;
    }

    return {
      vinculado: data.chat_id != null,
      token: data.token,
      deepLink: `https://t.me/${BOT_USERNAME}?start=${data.token}`,
      botUsername: BOT_USERNAME,
      telegramUsername: data.telegram_username,
      telegramNome: data.telegram_nome,
      vinculadoEm: data.vinculado_em,
    };
  });

export const listTelegramMensagens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { chatId?: number }) =>
    z.object({ chatId: z.number().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<TelegramMensagem[]> => {
    let q = context.supabase
      .from("telegram_mensagens")
      .select("id, chat_id, direcao, texto, autor, created_at")
      .eq("user_id", context.userId);
    if (data.chatId != null) q = q.eq("chat_id", data.chatId);
    const { data: rows, error } = await q.order("created_at", { ascending: true }).limit(300);
    if (error) throw new Error(error.message);
    return (rows ?? []) as TelegramMensagem[];
  });

export const listTelegramConversas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TelegramConversa[]> => {
    const { data, error } = await context.supabase
      .from("telegram_mensagens")
      .select("chat_id, texto, autor, direcao, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const mapa = new Map<number, TelegramConversa>();
    for (const m of data ?? []) {
      if (mapa.has(m.chat_id)) continue;
      mapa.set(m.chat_id, {
        chat_id: m.chat_id,
        titulo: (m.direcao === "entrada" ? m.autor : null) ?? `Chat ${m.chat_id}`,
        ultima: m.texto,
        ultimaEm: m.created_at,
      });
    }
    // Nomeia com o autor de alguma mensagem recebida, quando existir.
    for (const m of data ?? []) {
      const conv = mapa.get(m.chat_id);
      if (conv && m.direcao === "entrada" && m.autor && conv.titulo.startsWith("Chat ")) {
        conv.titulo = m.autor;
      }
    }
    return [...mapa.values()];
  });

export const enviarTelegramMensagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { texto: string; chatId?: number }) =>
    z
      .object({ texto: z.string().trim().min(1).max(4000), chatId: z.number().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { telegramCall } = await import("@/lib/telegram.server");
    const { supabase, userId } = context;

    let chatId = data.chatId ?? null;

    if (chatId != null) {
      // Só permite responder conversas que já pertencem ao usuário.
      const { data: permitido } = await supabase
        .from("telegram_mensagens")
        .select("id")
        .eq("user_id", userId)
        .eq("chat_id", chatId)
        .limit(1)
        .maybeSingle();
      if (!permitido) chatId = null;
    }

    if (chatId == null) {
      const { data: vinculo } = await supabase
        .from("telegram_vinculos")
        .select("chat_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!vinculo?.chat_id) throw new Error("Telegram não vinculado. Escaneie o QR Code primeiro.");
      chatId = vinculo.chat_id;
    }

    await telegramCall("sendMessage", { chat_id: chatId, text: data.texto });

    const { error } = await supabase.from("telegram_mensagens").insert({
      user_id: userId,
      chat_id: chatId,
      direcao: "saida",
      texto: data.texto,
      autor: "Sistema",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const desvincularTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("telegram_vinculos")
      .update({
        chat_id: null,
        telegram_username: null,
        telegram_nome: null,
        vinculado_em: null,
        token: novoToken(),
      })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
