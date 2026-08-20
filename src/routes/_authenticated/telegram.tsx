import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTelegramAccount } from "@/components/telegram/conectar-telegram";
import { sendTelegramMessage, loadOlderMessages } from "@/lib/telegram.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/telegram")({
  head: () => ({
    meta: [
      { title: "Telegram — Unifique Comercial" },
      {
        name: "description",
        content: "Converse com seus contatos do Telegram pessoal dentro do CRM Unifique.",
      },
      { property: "og:title", content: "Telegram — Unifique Comercial" },
      {
        property: "og:description",
        content: "Caixa de entrada do Telegram pessoal integrada ao CRM Unifique.",
      },
    ],
  }),
  component: TelegramInbox,
});

type Chat = {
  id: string;
  telegram_chat_id: number;
  chat_type: string;
  title: string | null;
  username: string | null;
  phone: string | null;
  photo_url: string | null;
  unread_count: number;
  last_message_text: string | null;
  last_message_at: string | null;
};

type Mensagem = {
  id: string;
  telegram_message_id: number | null;
  direction: string;
  message_type: string;
  content: string | null;
  media_url: string | null;
  sender_name: string | null;
  status: string;
  sent_at: string;
};

function hora(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function TelegramInbox() {
  const qc = useQueryClient();
  const { data: account, isLoading: loadingAccount } = useTelegramAccount();
  const [busca, setBusca] = useState("");
  const [chatId, setChatId] = useState<string | null>(null);

  const { data: chats, isLoading } = useQuery({
    queryKey: ["telegram-chats"],
    enabled: !!account?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("telegram_chats")
        .select("id, telegram_chat_id, chat_type, title, username, phone, photo_url, unread_count, last_message_text, last_message_at")
        .eq("telegram_account_id", account!.id)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as Chat[];
    },
  });

  // Busca também por conteúdo de mensagem.
  const { data: chatIdsPorConteudo } = useQuery({
    queryKey: ["telegram-busca-msg", busca],
    enabled: !!account?.id && busca.trim().length >= 3,
    queryFn: async () => {
      const { data } = await supabase
        .from("telegram_messages")
        .select("chat_id")
        .ilike("content", `%${busca.trim()}%`)
        .limit(200);
      return new Set((data ?? []).map((m) => m.chat_id));
    },
  });

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return chats ?? [];
    return (chats ?? []).filter(
      (c) =>
        (c.title ?? "").toLowerCase().includes(termo) ||
        (c.username ?? "").toLowerCase().includes(termo) ||
        (c.phone ?? "").includes(termo) ||
        chatIdsPorConteudo?.has(c.id),
    );
  }, [chats, busca, chatIdsPorConteudo]);

  const chatAtual = (chats ?? []).find((c) => c.id === chatId) ?? null;

  // Realtime: novas mensagens e atualização de conversas.
  useEffect(() => {
    if (!account?.id) return;
    const channel = supabase
      .channel(`telegram-${account.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "telegram_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["telegram-chats"] });
        qc.invalidateQueries({ queryKey: ["telegram-mensagens"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "telegram_chats" }, () => {
        qc.invalidateQueries({ queryKey: ["telegram-chats"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [account?.id, qc]);

  if (loadingAccount) return <Skeleton className="h-96 w-full" />;

  if (account?.status !== "conectado") {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <h1 className="text-xl font-semibold">Telegram não conectado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Conecte sua conta pessoal em Perfil → Integrações → Telegram para ver suas conversas aqui.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Telegram</h1>
      <div className="grid h-[calc(100vh-12rem)] grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)_260px]">
        <Card className="flex min-h-0 flex-col">
          <div className="border-b p-3">
            <Input
              placeholder="Pesquisar nome, @usuário, telefone ou mensagem"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading && <Skeleton className="m-3 h-20" />}
            {!isLoading && filtrados.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">Nenhuma conversa encontrada.</p>
            )}
            {filtrados.map((c) => (
              <button
                key={c.id}
                onClick={() => setChatId(c.id)}
                className={cn(
                  "flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left transition-colors hover:bg-accent",
                  chatId === c.id && "bg-accent",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{c.title ?? "Sem título"}</span>
                  {c.unread_count > 0 && (
                    <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">
                      {c.unread_count}
                    </span>
                  )}
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  {c.last_message_text ?? "—"}
                </span>
                <span className="text-[10px] text-muted-foreground">{hora(c.last_message_at)}</span>
              </button>
            ))}
          </div>
        </Card>

        <Conversa chat={chatAtual} />

        <Card className="hidden lg:block">
          <CardContent className="space-y-2 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Informações</div>
            {chatAtual ? (
              <>
                <div className="text-sm font-medium">{chatAtual.title ?? "—"}</div>
                {chatAtual.username && (
                  <div className="text-sm text-muted-foreground">@{chatAtual.username}</div>
                )}
                {chatAtual.phone && (
                  <div className="text-sm text-muted-foreground">{chatAtual.phone}</div>
                )}
                <div className="text-xs text-muted-foreground capitalize">{chatAtual.chat_type}</div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Selecione uma conversa.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const PAGINA = 40;

function Conversa({ chat }: { chat: Chat | null }) {
  const qc = useQueryClient();
  const [limite, setLimite] = useState(PAGINA);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const enviar = useServerFn(sendTelegramMessage);
  const carregarAntigas = useServerFn(loadOlderMessages);

  useEffect(() => {
    setLimite(PAGINA);
  }, [chat?.id]);

  const { data: mensagens, isLoading } = useQuery({
    queryKey: ["telegram-mensagens", chat?.id, limite],
    enabled: !!chat?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("telegram_messages")
        .select("id, telegram_message_id, direction, message_type, content, media_url, sender_name, status, sent_at")
        .eq("chat_id", chat!.id)
        .order("sent_at", { ascending: false })
        .limit(limite);
      if (error) throw error;
      return ((data ?? []) as Mensagem[]).slice().reverse();
    },
  });

  useEffect(() => {
    const el = scroller.current;
    if (el && limite === PAGINA) el.scrollTop = el.scrollHeight;
  }, [mensagens, limite]);

  async function onScroll() {
    const el = scroller.current;
    if (!el || el.scrollTop > 40 || !chat) return;
    if ((mensagens?.length ?? 0) < limite) {
      // já mostramos tudo que está sincronizado: buscar histórico mais antigo no Telegram
      const maisAntiga = mensagens?.[0]?.telegram_message_id ?? null;
      try {
        await carregarAntigas({ data: { chatId: chat.id, beforeMessageId: maisAntiga } });
        qc.invalidateQueries({ queryKey: ["telegram-mensagens"] });
      } catch {
        /* serviço indisponível: mantém o que já existe */
      }
      return;
    }
    setLimite((l) => l + PAGINA);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chat || !texto.trim()) return;
    setEnviando(true);
    try {
      await enviar({ data: { chatId: chat.id, text: texto.trim() } });
      setTexto("");
      qc.invalidateQueries({ queryKey: ["telegram-mensagens"] });
      qc.invalidateQueries({ queryKey: ["telegram-chats"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao enviar a mensagem.");
    } finally {
      setEnviando(false);
    }
  }

  if (!chat) {
    return (
      <Card className="flex items-center justify-center">
        <p className="p-6 text-sm text-muted-foreground">Selecione uma conversa para começar.</p>
      </Card>
    );
  }

  return (
    <Card className="flex min-h-0 flex-col">
      <div className="border-b px-4 py-3">
        <div className="text-sm font-semibold">{chat.title ?? "Sem título"}</div>
        {chat.username && <div className="text-xs text-muted-foreground">@{chat.username}</div>}
      </div>

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {isLoading && <Skeleton className="h-24 w-full" />}
        {mensagens?.map((m) => (
          <div
            key={m.id}
            className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                m.direction === "out" ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              {m.message_type !== "text" && (
                <div className="mb-1 text-xs opacity-80 capitalize">{m.message_type}</div>
              )}
              <div className="whitespace-pre-wrap break-words">{m.content ?? "—"}</div>
              <div className="mt-1 text-[10px] opacity-70">
                {hora(m.sent_at)}
                {m.direction === "out" && m.status !== "enviada" && ` · ${m.status}`}
              </div>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t p-3">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Digite uma mensagem…"
          maxLength={4096}
        />
        <Button type="submit" disabled={enviando || !texto.trim()}>
          {enviando ? "Enviando..." : "Enviar"}
        </Button>
      </form>
    </Card>
  );
}
