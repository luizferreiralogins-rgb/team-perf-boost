import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, Search, Send, Check, CheckCheck, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { sendWhatsappMessage, markConversationRead, whatsappConfigurado } from "@/lib/whatsapp.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MinhaContaWhatsapp } from "@/components/whatsapp/minha-conta";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  validateSearch: (s: Record<string, unknown>) => ({
    tel: typeof s.tel === "string" ? s.tel : undefined,
    nome: typeof s.nome === "string" ? s.nome : undefined,
  }),
  head: () => ({
    meta: [
      { title: "WhatsApp — Unifique" },
      { name: "description", content: "Converse com os clientes pelo WhatsApp diretamente no sistema." },
      { property: "og:title", content: "WhatsApp — Unifique" },
      { property: "og:description", content: "Converse com os clientes pelo WhatsApp diretamente no sistema." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WhatsAppPage,
});

type Conversa = {
  id: string;
  telefone: string;
  nome_contato: string | null;
  ultima_mensagem: string | null;
  ultima_mensagem_em: string | null;
  nao_lidas: number;
};

type Mensagem = {
  id: string;
  direcao: "enviada" | "recebida";
  tipo: string;
  conteudo: string | null;
  status: string;
  enviada_em: string | null;
  created_at: string;
};

const fmtHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
const fmtData = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : "";

function StatusIcon({ status }: { status: string }) {
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5 text-sky-500" />;
  if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />;
  if (status === "sent") return <Check className="h-3.5 w-3.5 text-muted-foreground" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
}

function WhatsAppPage() {
  const search = useSearch({ from: "/_authenticated/whatsapp" });
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const fimRef = useRef<HTMLDivElement>(null);

  const configurado = useQuery({
    queryKey: ["whatsapp-configurado"],
    queryFn: useServerFn(whatsappConfigurado),
  });

  const conversas = useQuery({
    queryKey: ["whatsapp-conversas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select("id, telefone, nome_contato, ultima_mensagem, ultima_mensagem_em, nao_lidas")
        .order("ultima_mensagem_em", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Conversa[];
    },
  });

  // Realtime: novas mensagens e conversas atualizam sem recarregar
  useEffect(() => {
    const canal = supabase
      .channel("whatsapp-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conversations" }, () =>
        qc.invalidateQueries({ queryKey: ["whatsapp-conversas"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["whatsapp-mensagens"] });
        qc.invalidateQueries({ queryKey: ["whatsapp-conversas"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [qc]);

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const lista = conversas.data ?? [];
    if (!b) return lista;
    return lista.filter(
      (c) =>
        c.nome_contato?.toLowerCase().includes(b) ||
        c.telefone.includes(b) ||
        c.ultima_mensagem?.toLowerCase().includes(b),
    );
  }, [conversas.data, busca]);

  // Deep-link vindo do Pós-vendas: /whatsapp?tel=...&nome=...
  useEffect(() => {
    if (!search.tel || !conversas.data) return;
    const tel = search.tel.replace(/\D/g, "");
    const existente = conversas.data.find((c) => c.telefone.endsWith(tel.slice(-11)));
    if (existente) setSelecionada(existente.id);
    else setSelecionada(`nova:${tel}:${search.nome ?? ""}`);
  }, [search.tel, search.nome, conversas.data]);

  const convSelecionada = useMemo(() => {
    if (!selecionada) return null;
    if (selecionada.startsWith("nova:")) {
      const [, tel, nome] = selecionada.split(":");
      return {
        id: null as string | null,
        telefone: tel,
        nome_contato: nome || null,
      };
    }
    return conversas.data?.find((c) => c.id === selecionada) ?? null;
  }, [selecionada, conversas.data]);

  const mensagens = useQuery({
    queryKey: ["whatsapp-mensagens", convSelecionada?.id],
    enabled: Boolean(convSelecionada?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("id, direcao, tipo, conteudo, status, enviada_em, created_at")
        .eq("conversation_id", convSelecionada!.id!)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Mensagem[];
    },
  });

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens.data?.length]);

  const marcarLida = useServerFn(markConversationRead);
  useEffect(() => {
    if (convSelecionada?.id && (conversas.data?.find((c) => c.id === convSelecionada.id)?.nao_lidas ?? 0) > 0) {
      marcarLida({ data: { conversationId: convSelecionada.id } }).then(() =>
        qc.invalidateQueries({ queryKey: ["whatsapp-conversas"] }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convSelecionada?.id]);

  const enviar = useMutation({
    mutationFn: useServerFn(sendWhatsappMessage),
    onSuccess: () => {
      setTexto("");
      qc.invalidateQueries({ queryKey: ["whatsapp-mensagens"] });
      qc.invalidateQueries({ queryKey: ["whatsapp-conversas"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar a mensagem."),
  });

  const enviarTexto = () => {
    if (!convSelecionada || !texto.trim()) return;
    enviar.mutate({
      data: {
        telefone: convSelecionada.telefone,
        texto: texto.trim(),
        nomeContato: convSelecionada.nome_contato ?? undefined,
      },
    });
  };

  if (configurado.data && !configurado.data.configurado) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border p-8 text-center space-y-3">
        <MessageCircle className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">WhatsApp ainda não conectado</h1>
        <p className="text-sm text-muted-foreground">
          Conecte o seu próprio WhatsApp Business para enviar e receber mensagens. Depois disso, suas
          conversas com clientes aparecerão aqui.
        </p>
        <MinhaContaWhatsapp trigger={<Button>Conectar meu WhatsApp</Button>} />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Lista de conversas */}
      <div className={cn("w-full flex-col rounded-lg border bg-card md:flex md:w-80", convSelecionada && "hidden")}>
        <div className="border-b p-3 space-y-2">
          <MinhaContaWhatsapp />
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar conversa..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtradas.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhuma conversa ainda. As mensagens dos clientes aparecem aqui automaticamente.
            </p>
          )}
          {filtradas.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelecionada(c.id)}
              className={cn(
                "flex w-full items-start gap-3 border-b px-3 py-3 text-left hover:bg-accent/50",
                selecionada === c.id && "bg-accent",
              )}
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {(c.nome_contato ?? c.telefone).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {c.nome_contato ?? c.telefone}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {fmtData(c.ultima_mensagem_em)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">
                    {c.ultima_mensagem ?? "—"}
                  </span>
                  {c.nao_lidas > 0 && (
                    <Badge className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[11px]">
                      {c.nao_lidas}
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Thread */}
      <div className={cn("flex-1 flex-col rounded-lg border bg-card", convSelecionada ? "flex" : "hidden md:flex")}>
        {!convSelecionada ? (
          <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
            Selecione uma conversa para começar.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden"
                onClick={() => setSelecionada(null)}
              >
                ← Voltar
              </Button>
              <div>
                <p className="text-sm font-medium">{convSelecionada.nome_contato ?? convSelecionada.telefone}</p>
                <p className="text-xs text-muted-foreground">{convSelecionada.telefone}</p>
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {(mensagens.data ?? []).map((m) => (
                <div
                  key={m.id}
                  className={cn("flex", m.direcao === "enviada" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                      m.direcao === "enviada"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                    <div
                      className={cn(
                        "mt-1 flex items-center justify-end gap-1 text-[10px]",
                        m.direcao === "enviada" ? "text-primary-foreground/70" : "text-muted-foreground",
                      )}
                    >
                      {fmtHora(m.enviada_em ?? m.created_at)}
                      {m.direcao === "enviada" && <StatusIcon status={m.status} />}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={fimRef} />
            </div>

            <div className="flex items-center gap-2 border-t p-3">
              <Input
                placeholder="Digite uma mensagem..."
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviarTexto();
                  }
                }}
              />
              <Button onClick={enviarTexto} disabled={!texto.trim() || enviar.isPending}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
