import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import { Send, Smartphone, Unlink, RefreshCw, MessagesSquare } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getTelegramStatus,
  listTelegramMensagens,
  listTelegramConversas,
  enviarTelegramMensagem,
  desvincularTelegram,
} from "@/lib/telegram.functions";


export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Chat Telegram — Unifique Comercial" },
      {
        name: "description",
        content:
          "Converse com o bot da Unifique direto no sistema. Vincule seu Telegram por QR Code e troque mensagens com a equipe.",
      },
      { property: "og:title", content: "Chat Telegram — Unifique Comercial" },
      {
        property: "og:description",
        content: "Vincule o Telegram por QR Code e converse com a equipe dentro do sistema.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const statusFn = useServerFn(getTelegramStatus);
  const status = useQuery({
    queryKey: ["telegram-status"],
    queryFn: () => statusFn(),
    refetchInterval: (q) => (q.state.data?.vinculado ? false : 4000),
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Chat Telegram</h1>
          <p className="text-sm text-muted-foreground">
            Vincule sua conta pelo QR Code e converse com a equipe pelo bot da Unifique.
          </p>
        </header>

        {status.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {status.data && !status.data.vinculado && <VincularCard status={status.data} />}
        {status.data?.vinculado && <ChatBox nome={status.data.telegramNome} username={status.data.telegramUsername} />}
      </div>
    </AppShell>
  );
}

function VincularCard({
  status,
}: {
  status: { deepLink: string; botUsername: string };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5" /> Conectar Telegram
        </CardTitle>
        <CardDescription>
          Escaneie o QR Code com a câmera do celular (ou pelo Telegram Web) para vincular sua conta ao
          sistema. O vínculo é individual e só você vê suas conversas.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6 md:flex-row md:items-start">
        <div className="rounded-xl border bg-white p-4">
          <QRCode value={status.deepLink} size={192} />
        </div>
        <div className="space-y-3 text-sm">
          <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
            <li>Abra a câmera do celular ou o Telegram Web e aponte para o QR Code.</li>
            <li>
              O Telegram abrirá a conversa com <b>@{status.botUsername}</b>.
            </li>
            <li>
              Toque em <b>Iniciar / Start</b> — o vínculo é concluído automaticamente.
            </li>
          </ol>
          <Button asChild variant="outline">
            <a href={status.deepLink} target="_blank" rel="noreferrer">
              Abrir no Telegram Web
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ChatBox({ nome, username }: { nome: string | null; username: string | null }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listTelegramMensagens);
  const conversasFn = useServerFn(listTelegramConversas);
  const enviarFn = useServerFn(enviarTelegramMensagem);
  const desvincularFn = useServerFn(desvincularTelegram);
  const [texto, setTexto] = useState("");
  const [chatAtivo, setChatAtivo] = useState<number | null>(null);
  const fim = useRef<HTMLDivElement>(null);

  const conversas = useQuery({
    queryKey: ["telegram-conversas"],
    queryFn: () => conversasFn(),
    refetchInterval: 5000,
  });

  const mensagens = useQuery({
    queryKey: ["telegram-mensagens", chatAtivo],
    queryFn: () => listFn({ data: chatAtivo != null ? { chatId: chatAtivo } : {} }),
    refetchInterval: 5000,
  });

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens.data?.length]);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["telegram-mensagens"] });
    qc.invalidateQueries({ queryKey: ["telegram-conversas"] });
  };

  const enviar = useMutation({
    mutationFn: (t: string) =>
      enviarFn({ data: { texto: t, ...(chatAtivo != null ? { chatId: chatAtivo } : {}) } }),
    onSuccess: () => {
      setTexto("");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const desvincular = useMutation({
    mutationFn: () => desvincularFn(),
    onSuccess: () => {
      toast.success("Telegram desvinculado.");
      qc.invalidateQueries({ queryKey: ["telegram-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const conversaAtiva = conversas.data?.find((c) => c.chat_id === chatAtivo);

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <Card className="h-[70vh] overflow-y-auto">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessagesSquare className="h-4 w-4" /> Conversas
          </CardTitle>
          <CardDescription>Mensagens recebidas pelo bot</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 px-2">
          <button
            type="button"
            onClick={() => setChatAtivo(null)}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
              chatAtivo === null ? "bg-primary/10 font-medium" : "hover:bg-muted"
            }`}
          >
            Todas as mensagens
          </button>
          {conversas.data?.map((c) => (
            <button
              key={c.chat_id}
              type="button"
              onClick={() => setChatAtivo(c.chat_id)}
              className={`w-full rounded-lg px-3 py-2 text-left transition ${
                chatAtivo === c.chat_id ? "bg-primary/10" : "hover:bg-muted"
              }`}
            >
              <span className="block truncate text-sm font-medium">{c.titulo}</span>
              <span className="block truncate text-xs text-muted-foreground">{c.ultima}</span>
            </button>
          ))}
          {conversas.data?.length === 0 && (
            <p className="px-3 py-4 text-xs text-muted-foreground">Nenhuma conversa ainda.</p>
          )}
        </CardContent>
      </Card>

      <Card className="flex h-[70vh] flex-col">
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b">
          <div>
            <CardTitle className="text-base">
              {conversaAtiva?.titulo ?? nome ?? "Telegram"}
            </CardTitle>
            <CardDescription>
              {conversaAtiva ? `Chat ${conversaAtiva.chat_id}` : username ? `@${username}` : "Conectado"}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={invalidar}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={desvincular.isPending}
              onClick={() => desvincular.mutate()}
            >
              <Unlink className="mr-2 h-4 w-4" /> Desvincular
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 space-y-3 overflow-y-auto py-4">
          {mensagens.data?.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma mensagem ainda. Envie a primeira abaixo.
            </p>
          )}
          {mensagens.data?.map((m) => (
            <div
              key={m.id}
              className={m.direcao === "saida" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  m.direcao === "saida"
                    ? "max-w-[75%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground"
                    : "max-w-[75%] rounded-2xl rounded-bl-sm bg-muted px-4 py-2 text-sm"
                }
              >
                {m.direcao === "entrada" && m.autor && (
                  <span className="mb-1 block text-[11px] font-medium opacity-70">{m.autor}</span>
                )}
                <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                <span className="mt-1 block text-[10px] opacity-70">
                  {new Date(m.created_at).toLocaleString("pt-BR")}
                </span>
              </div>
            </div>
          ))}
          <div ref={fim} />
        </CardContent>

        <form
          className="flex gap-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const t = texto.trim();
            if (t) enviar.mutate(t);
          }}
        >
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva uma mensagem…"
            maxLength={4000}
          />
          <Button type="submit" disabled={enviar.isPending || !texto.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </Card>
    </div>
  );
}

