import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PessoalStatus = {
  configurado: boolean;
  connected: boolean;
  phone?: string | null;
  firstName?: string | null;
  username?: string | null;
  connectedAt?: string | null;
};

export type Dialogo = {
  id: string;
  title: string;
  username: string | null;
  type: "user" | "group" | "channel" | "bot";
  unread: number;
  lastMessage: string | null;
  lastDate: string | null;
};

export type MensagemPessoal = {
  id: string;
  out: boolean;
  text: string | null;
  author: string | null;
  date: string;
};

export const getStatusPessoal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PessoalStatus> => {
    const { getBridgeConfig, bridgeCall } = await import("@/lib/telegram-pessoal.server");
    if (!getBridgeConfig()) return { configurado: false, connected: false };
    const r = await bridgeCall<Omit<PessoalStatus, "configurado">>("/session/status", {
      app_user_id: context.userId,
    });
    return { configurado: true, ...r };
  });

export const enviarCodigoPessoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phone: string }) =>
    z
      .object({
        phone: z
          .string()
          .trim()
          .regex(/^\+[1-9]\d{7,14}$/, "Informe o número no formato internacional, ex.: +5584991234567"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { bridgeCall } = await import("@/lib/telegram-pessoal.server");
    return bridgeCall<{ phoneCodeHash: string; timeout?: number }>("/auth/send-code", {
      app_user_id: context.userId,
      phone: data.phone,
    });
  });

export const confirmarCodigoPessoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phone: string; phoneCodeHash: string; code: string }) =>
    z
      .object({
        phone: z.string().trim().min(8).max(20),
        phoneCodeHash: z.string().trim().min(1).max(200),
        code: z.string().trim().regex(/^\d{4,7}$/, "Código inválido"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { bridgeCall } = await import("@/lib/telegram-pessoal.server");
    return bridgeCall<{
      status: "ok" | "password_required";
      hint?: string | null;
      firstName?: string | null;
      username?: string | null;
    }>("/auth/sign-in", { app_user_id: context.userId, ...data });
  });

export const confirmarSenha2FA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { password: string }) =>
    z.object({ password: z.string().min(1).max(256) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { bridgeCall } = await import("@/lib/telegram-pessoal.server");
    return bridgeCall<{ status: "ok"; firstName?: string | null; username?: string | null }>(
      "/auth/password",
      { app_user_id: context.userId, password: data.password },
    );
  });

export const sairTelegramPessoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { bridgeCall } = await import("@/lib/telegram-pessoal.server");
    return bridgeCall<{ ok: true }>("/auth/logout", { app_user_id: context.userId });
  });

export const listarDialogos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Dialogo[]> => {
    const { getBridgeConfig, bridgeCall } = await import("@/lib/telegram-pessoal.server");
    if (!getBridgeConfig()) return [];
    const r = await bridgeCall<{ dialogs: Dialogo[] }>("/dialogs", {
      app_user_id: context.userId,
      limit: 50,
    });
    return r.dialogs ?? [];
  });

export const listarMensagensPessoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { peerId: string }) =>
    z.object({ peerId: z.string().trim().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<MensagemPessoal[]> => {
    const { bridgeCall } = await import("@/lib/telegram-pessoal.server");
    const r = await bridgeCall<{ messages: MensagemPessoal[] }>("/messages", {
      app_user_id: context.userId,
      peer_id: data.peerId,
      limit: 50,
    });
    return r.messages ?? [];
  });

export const enviarMensagemPessoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { peerId: string; text: string }) =>
    z
      .object({
        peerId: z.string().trim().min(1).max(64),
        text: z.string().trim().min(1).max(4096),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { bridgeCall } = await import("@/lib/telegram-pessoal.server");
    return bridgeCall<{ id: string; date: string }>("/messages/send", {
      app_user_id: context.userId,
      peer_id: data.peerId,
      text: data.text,
    });
  });

export const buscarContatos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { query: string }) =>
    z.object({ query: z.string().trim().min(2).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { bridgeCall } = await import("@/lib/telegram-pessoal.server");
    const r = await bridgeCall<{ results: Omit<Dialogo, "unread" | "lastMessage" | "lastDate">[] }>(
      "/search",
      { app_user_id: context.userId, query: data.query },
    );
    return r.results ?? [];
  });
