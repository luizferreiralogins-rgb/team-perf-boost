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
  .handler(async ({ context }): Promise<TelegramMensagem[]> => {
    const { data, error } = await context.supabase
      .from("telegram_mensagens")
      .select("id, direcao, texto, autor, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as TelegramMensagem[];
  });

export const enviarTelegramMensagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { texto: string }) =>
    z.object({ texto: z.string().trim().min(1).max(4000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { telegramCall } = await import("@/lib/telegram.server");
    const { supabase, userId } = context;

    const { data: vinculo } = await supabase
      .from("telegram_vinculos")
      .select("chat_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!vinculo?.chat_id) throw new Error("Telegram não vinculado. Escaneie o QR Code primeiro.");

    await telegramCall("sendMessage", { chat_id: vinculo.chat_id, text: data.texto });

    const { error } = await supabase.from("telegram_mensagens").insert({
      user_id: userId,
      chat_id: vinculo.chat_id,
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
