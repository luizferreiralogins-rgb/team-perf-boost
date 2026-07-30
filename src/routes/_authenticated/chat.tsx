import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, MessagesSquare, RefreshCw, Search, Send } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Chat da equipe — Unifique Comercial" },
      {
        name: "description",
        content:
          "Converse por mensagem com qualquer usuário do sistema, mantenha o histórico e abra uma tarefa na agenda direto da conversa.",
      },
      { property: "og:title", content: "Chat da equipe — Unifique Comercial" },
      {
        property: "og:description",
        content: "Mensagens internas entre usuários com histórico e atalho para a Agenda/Tarefas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
});

type Pessoa = { id: string; nome: string };

type Mensagem = {
  id: string;
  remetente_id: string;
  destinatario_id: string;
  texto: string;
  lida: boolean;
  created_at: string;
};

function ChatPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [contatoId, setContatoId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  const me = useQuery({
    queryKey: ["chat-me"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
    staleTime: 60_000,
  });

  const pessoas = useQuery({
    queryKey: ["chat-pessoas"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("listar_usuarios_tarefas");
      if (error) throw error;
      return (data ?? []) as Pessoa[];
    },
    staleTime: 60_000,
  });

  const mensagens = useQuery({
    queryKey: ["chat-mensagens"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mensagens_chat")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as Mensagem[];
    },
    refetchInterval: 5000,
  });

  const meId = me.data ?? null;

  const contatos = useMemo(() => {
    const lista = (pessoas.data ?? []).filter((p) => p.id !== meId);
    const termo = busca.trim().toLowerCase();
    const filtrada = termo ? lista.filter((p) => p.nome.toLowerCase().includes(termo)) : lista;
    const msgs = mensagens.data ?? [];
    return filtrada
      .map((p) => {
        const doPar = msgs.filter(
          (m) => m.remetente_id === p.id || m.destinatario_id === p.id,
        );
        const ultima = doPar[doPar.length - 1];
        const naoLidas = msgs.filter(
          (m) => m.remetente_id === p.id && m.destinatario_id === meId && !m.lida,
        ).length;
        return { ...p, ultima, naoLidas };
      })
      .sort((a, b) => {
        const ta = a.ultima ? Date.parse(a.ultima.created_at) : 0;
        const tb = b.ultima ? Date.parse(b.ultima.created_at) : 0;
        if (ta !== tb) return tb - ta;
        return a.nome.localeCompare(b.nome);
      });
  }, [pessoas.data, mensagens.data, meId, busca]);

  const conversa = useMemo(
    () =>
      (mensagens.data ?? []).filter(
        (m) =>
          (m.remetente_id === meId && m.destinatario_id === contatoId) ||
          (m.remetente_id === contatoId && m.destinatario_id === meId),
      ),
    [mensagens.data, meId, contatoId],
  );

  const contato = contatos.find((c) => c.id === contatoId);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversa.length, contatoId]);

  // marca as mensagens recebidas do contato aberto como lidas
  useEffect(() => {
    if (!contatoId || !meId) return;
    const pendentes = conversa.filter(
      (m) => m.remetente_id === contatoId && m.destinatario_id === meId && !m.lida,
    );
    if (pendentes.length === 0) return;
    void supabase
      .from("mensagens_chat")
      .update({ lida: true })
      .in(
        "id",
        pendentes.map((m) => m.id),
      )
      .then(() => qc.invalidateQueries({ queryKey: ["chat-mensagens"] }));
  }, [contatoId, meId, conversa, qc]);

  const enviar = useMutation({
    mutationFn: async (t: string) => {
      if (!meId || !contatoId) throw new Error("Selecione um contato.");
      const { error } = await supabase
        .from("mensagens_chat")
        .insert({ remetente_id: meId, destinatario_id: contatoId, texto: t });
      if (error) throw error;
    },
    onSuccess: () => {
      setTexto("");
      qc.invalidateQueries({ queryKey: ["chat-mensagens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Chat da equipe</h1>
          <p className="text-sm text-muted-foreground">
            Converse por mensagem com qualquer usuário do sistema. Todo o histórico fica salvo.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <Card className="flex h-[70vh] flex-col">
            <CardHeader className="space-y-2 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessagesSquare className="h-4 w-4" /> Contatos
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar usuário…"
                  className="pl-8"
                />
              </div>
            </CardHeader>
            <CardContent className="flex-1 space-y-1 overflow-y-auto px-2">
              {contatos.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setContatoId(c.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left transition ${
                    contatoId === c.id ? "bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.nome}</span>
                    {c.naoLidas > 0 && (
                      <span className="rounded-full bg-primary px-2 text-[11px] font-semibold text-primary-foreground">
                        {c.naoLidas}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.ultima?.texto ?? "Sem mensagens"}
                  </span>
                </button>
              ))}
              {contatos.length === 0 && (
                <p className="px-3 py-4 text-xs text-muted-foreground">Nenhum usuário encontrado.</p>
              )}
            </CardContent>
          </Card>

          <Card className="flex h-[70vh] flex-col">
            <CardHeader className="flex-row items-center justify-between space-y-0 border-b">
              <div className="min-w-0">
                <CardTitle className="truncate text-base">
                  {contato?.nome ?? "Selecione um contato"}
                </CardTitle>
                <CardDescription>
                  {contato ? "Conversa privada" : "Escolha alguém na lista ao lado"}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => qc.invalidateQueries({ queryKey: ["chat-mensagens"] })}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!contato}
                  onClick={() =>
                    contato &&
                    navigate({
                      to: "/tarefas",
                      search: { responsavel: contato.id },
                    })
                  }
                >
                  <CalendarPlus className="mr-2 h-4 w-4" /> Agenda/Tarefa
                </Button>
              </div>
            </CardHeader>

            <CardContent className="flex-1 space-y-3 overflow-y-auto py-4">
              {!contato && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Selecione um usuário para começar a conversa.
                </p>
              )}
              {contato && conversa.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma mensagem ainda. Envie a primeira abaixo.
                </p>
              )}
              {conversa.map((m) => (
                <div
                  key={m.id}
                  className={m.remetente_id === meId ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={
                      m.remetente_id === meId
                        ? "max-w-[75%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground"
                        : "max-w-[75%] rounded-2xl rounded-bl-sm bg-muted px-4 py-2 text-sm"
                    }
                  >
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
                placeholder={contato ? `Mensagem para ${contato.nome}…` : "Selecione um contato"}
                disabled={!contato}
                maxLength={4000}
              />
              <Button type="submit" disabled={!contato || enviar.isPending || !texto.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
