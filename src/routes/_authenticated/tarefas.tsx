import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, CalendarDays, Check, Plus, Trash2, X } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tarefas")({
  head: () => ({
    meta: [
      { title: "Agenda e Tarefas — Unifique Comercial" },
      {
        name: "description",
        content:
          "Crie tarefas para você, para outros usuários ou para clientes, acompanhe a agenda e receba avisos de vencimento no dia seguinte.",
      },
      { property: "og:title", content: "Agenda e Tarefas — Unifique Comercial" },
      {
        property: "og:description",
        content: "Agenda comercial com tarefas próprias, de equipe e de clientes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TarefasPage,
});

type Alvo = "propria" | "usuario" | "cliente";
type Prioridade = "baixa" | "media" | "alta";
type Status = "pendente" | "concluida" | "cancelada";

type Tarefa = {
  id: string;
  criador_id: string;
  responsavel_id: string | null;
  alvo: Alvo;
  cliente_nome: string | null;
  cliente_contato: string | null;
  titulo: string;
  descricao: string | null;
  data_venc: string;
  hora_venc: string | null;
  prioridade: Prioridade;
  status: Status;
};

const hoje = () => new Date().toISOString().slice(0, 10);
const amanha = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

function formatarData(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function TarefasPage() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<"pendentes" | "todas">("pendentes");

  const me = useQuery({
    queryKey: ["tarefas-me"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
    staleTime: 60_000,
  });

  const pessoas = useQuery({
    queryKey: ["tarefas-pessoas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, email")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const tarefas = useQuery({
    queryKey: ["tarefas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("*")
        .order("data_venc", { ascending: true })
        .order("hora_venc", { ascending: true, nullsFirst: true });
      if (error) throw error;
      return (data ?? []) as Tarefa[];
    },
    refetchInterval: 60_000,
  });

  const lista = useMemo(() => {
    const t = tarefas.data ?? [];
    return filtro === "pendentes" ? t.filter((x) => x.status === "pendente") : t;
  }, [tarefas.data, filtro]);

  const grupos = useMemo(() => {
    const map = new Map<string, Tarefa[]>();
    for (const t of lista) {
      const arr = map.get(t.data_venc) ?? [];
      arr.push(t);
      map.set(t.data_venc, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [lista]);

  const vencemAmanha = (tarefas.data ?? []).filter(
    (t) => t.status === "pendente" && t.data_venc === amanha(),
  );
  const atrasadas = (tarefas.data ?? []).filter(
    (t) => t.status === "pendente" && t.data_venc < hoje(),
  );

  const atualizar = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from("tarefas").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tarefas"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarefas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa excluída.");
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nomePessoa = (id: string | null) =>
    pessoas.data?.find((p) => p.id === id)?.nome || "—";

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Agenda / Tarefas</h1>
            <p className="text-sm text-muted-foreground">
              Crie tarefas para você, para colegas ou para clientes e acompanhe os vencimentos.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={filtro === "pendentes" ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltro("pendentes")}
            >
              Pendentes
            </Button>
            <Button
              variant={filtro === "todas" ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltro("todas")}
            >
              Todas
            </Button>
          </div>
        </header>

        {(vencemAmanha.length > 0 || atrasadas.length > 0) && (
          <div className="flex gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
            <Bell className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="space-y-1">
              {atrasadas.length > 0 && (
                <p>
                  <b>{atrasadas.length}</b> tarefa(s) em atraso.
                </p>
              )}
              {vencemAmanha.length > 0 && (
                <>
                  <p className="font-medium">
                    {vencemAmanha.length} tarefa(s) vencem amanhã ({formatarData(amanha())}):
                  </p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {vencemAmanha.map((t) => (
                      <li key={t.id}>
                        {t.titulo}
                        {t.hora_venc ? ` — ${t.hora_venc.slice(0, 5)}` : ""}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}

        <NovaTarefa
          meId={me.data ?? null}
          pessoas={pessoas.data ?? []}
          onCriada={() => qc.invalidateQueries({ queryKey: ["tarefas"] })}
        />

        {tarefas.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!tarefas.isLoading && grupos.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma tarefa por aqui.</p>
        )}

        <div className="space-y-5">
          {grupos.map(([data, itens]) => (
            <section key={data} className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                {formatarData(data)}
                {data === hoje() && <span className="text-primary">• hoje</span>}
                {data === amanha() && <span className="text-primary">• amanhã</span>}
                {data < hoje() && <span className="text-destructive">• atrasada</span>}
              </h2>
              <div className="space-y-2">
                {itens.map((t) => (
                  <Card key={t.id} className={cn(t.status !== "pendente" && "opacity-60")}>
                    <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium">
                          {t.titulo}
                          {t.hora_venc && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {t.hora_venc.slice(0, 5)}
                            </span>
                          )}
                        </p>
                        {t.descricao && (
                          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                            {t.descricao}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {t.alvo === "cliente"
                            ? `Cliente: ${t.cliente_nome ?? "—"}${
                                t.cliente_contato ? ` (${t.cliente_contato})` : ""
                              }`
                            : `Responsável: ${nomePessoa(t.responsavel_id)}`}
                          {" · "}Prioridade {PRIORIDADE_LABEL[t.prioridade]}
                          {t.status !== "pendente" &&
                            ` · ${t.status === "concluida" ? "Concluída" : "Cancelada"}`}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {t.status === "pendente" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Concluir"
                              onClick={() => atualizar.mutate({ id: t.id, status: "concluida" })}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Cancelar"
                              onClick={() => atualizar.mutate({ id: t.id, status: "cancelada" })}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {t.criador_id === me.data && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Excluir"
                            onClick={() => excluir.mutate(t.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function NovaTarefa({
  meId,
  pessoas,
  onCriada,
}: {
  meId: string | null;
  pessoas: { id: string; nome: string; email: string | null }[];
  onCriada: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [alvo, setAlvo] = useState<Alvo>("propria");
  const [responsavel, setResponsavel] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteContato, setClienteContato] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState(hoje());
  const [hora, setHora] = useState("");
  const [prioridade, setPrioridade] = useState<Prioridade>("media");

  const limpar = () => {
    setAlvo("propria");
    setResponsavel("");
    setClienteNome("");
    setClienteContato("");
    setTitulo("");
    setDescricao("");
    setData(hoje());
    setHora("");
    setPrioridade("media");
  };

  const criar = useMutation({
    mutationFn: async () => {
      if (!meId) throw new Error("Sessão expirada.");
      const t = titulo.trim();
      if (!t) throw new Error("Informe o título da tarefa.");
      if (alvo === "usuario" && !responsavel) throw new Error("Escolha o responsável.");
      if (alvo === "cliente" && !clienteNome.trim()) throw new Error("Informe o nome do cliente.");

      const { error } = await supabase.from("tarefas").insert({
        criador_id: meId,
        alvo,
        responsavel_id: alvo === "propria" ? meId : alvo === "usuario" ? responsavel : meId,
        cliente_nome: alvo === "cliente" ? clienteNome.trim().slice(0, 120) : null,
        cliente_contato: alvo === "cliente" ? clienteContato.trim().slice(0, 60) || null : null,
        titulo: t.slice(0, 140),
        descricao: descricao.trim().slice(0, 1000) || null,
        data_venc: data,
        hora_venc: hora || null,
        prioridade,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa criada.");
      limpar();
      setAberto(false);
      onCriada();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!aberto) {
    return (
      <Button onClick={() => setAberto(true)}>
        <Plus className="mr-2 h-4 w-4" /> Nova tarefa
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nova tarefa</CardTitle>
        <CardDescription>Para você, para um colega ou vinculada a um cliente.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            criar.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={alvo} onValueChange={(v) => setAlvo(v as Alvo)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="propria">Para mim</SelectItem>
                <SelectItem value="usuario">Para outro usuário</SelectItem>
                <SelectItem value="cliente">Para um cliente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {alvo === "usuario" && (
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={responsavel} onValueChange={setResponsavel}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {pessoas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {alvo === "cliente" && (
            <>
              <div className="space-y-1.5">
                <Label>Nome do cliente</Label>
                <Input
                  value={clienteNome}
                  onChange={(e) => setClienteNome(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Contato (telefone/e-mail)</Label>
                <Input
                  value={clienteContato}
                  onChange={(e) => setClienteContato(e.target.value)}
                  maxLength={60}
                />
              </div>
            </>
          )}

          <div className="space-y-1.5 md:col-span-2">
            <Label>Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={140} />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>Descrição</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              maxLength={1000}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Hora (opcional)</Label>
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <Select value={prioridade} onValueChange={(v) => setPrioridade(v as Prioridade)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2 md:col-span-2">
            <Button type="submit" disabled={criar.isPending}>
              Salvar tarefa
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                limpar();
                setAberto(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
