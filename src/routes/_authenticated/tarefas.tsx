import { createFileRoute } from "@tanstack/react-router";
import {
  useOrdenacao,
  cmpTexto,
  cmpDataAsc,
  cmpDataDesc,
  type OpcaoOrdenacao,
} from "@/components/ordenacao";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, CalendarDays, Check, Pencil, Plus, Trash2, X } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { WhatsAppLink } from "@/components/whatsapp-link";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tarefas")({
  validateSearch: (search: Record<string, unknown>) => ({
    responsavel: typeof search.responsavel === "string" ? search.responsavel : undefined,
  }),
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
type Status = "pendente" | "iniciada" | "concluida" | "cancelada";

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
  recorrencia: Recorrencia;
};

const hoje = () => new Date().toISOString().slice(0, 10);
const amanha = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

const STATUS_LABEL: Record<Status, string> = {
  pendente: "Parado",
  iniciada: "Iniciado",
  concluida: "Concluído",
  cancelada: "Cancelado",
};

const STATUS_BOTOES: { valor: Status; label: string }[] = [
  { valor: "pendente", label: "Parado" },
  { valor: "iniciada", label: "Iniciado" },
  { valor: "concluida", label: "Concluído" },
];

const emAberto = (s: Status) => s === "pendente" || s === "iniciada";


type Recorrencia = "nenhuma" | "diaria" | "semanal" | "quinzenal" | "mensal";

const RECORRENCIA_LABEL: Record<Recorrencia, string> = {
  nenhuma: "Sem recorrência",
  diaria: "Diária",
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
};

/** Próxima data da tarefa conforme a recorrência configurada. */
export function proximaData(inicio: string, recorrencia: Recorrencia) {
  if (recorrencia === "nenhuma") return null;
  const [y, m, d] = inicio.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  if (recorrencia === "diaria") base.setUTCDate(base.getUTCDate() + 1);
  else if (recorrencia === "semanal") base.setUTCDate(base.getUTCDate() + 7);
  else if (recorrencia === "quinzenal") base.setUTCDate(base.getUTCDate() + 14);
  else if (recorrencia === "mensal") base.setUTCMonth(base.getUTCMonth() + 1);
  return base.toISOString().slice(0, 10);
}

function formatarData(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}


function TarefasPage() {
  const qc = useQueryClient();
  const { responsavel: responsavelInicial } = Route.useSearch();
  const [editando, setEditando] = useState<Tarefa | null>(null);

  const me = useQuery({
    queryKey: ["tarefas-me"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
    staleTime: 60_000,
  });

  const pessoas = useQuery({
    queryKey: ["tarefas-pessoas"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("listar_usuarios_tarefas");
      if (error) throw error;
      return (data ?? []).map((p) => ({ id: p.id, nome: p.nome, email: null as string | null }));
    },
    staleTime: 60_000,
  });

  const uid = me.data ?? null;

  const participo = useQuery({
    enabled: !!uid,
    queryKey: ["tarefas-participo", uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefa_participantes")
        .select("tarefa_id")
        .eq("user_id", uid!);
      if (error) throw error;
      return (data ?? []).map((r) => r.tarefa_id);
    },
  });

  const tarefas = useQuery({
    enabled: !!uid && participo.isSuccess,
    queryKey: ["tarefas", uid, participo.data],
    queryFn: async () => {
      const ids = participo.data ?? [];
      const filtros = [`criador_id.eq.${uid}`, `responsavel_id.eq.${uid}`];
      if (ids.length) filtros.push(`id.in.(${ids.join(",")})`);
      const { data, error } = await supabase
        .from("tarefas")
        .select("*")
        .or(filtros.join(","))
        .in("status", ["pendente", "iniciada"])
        .order("data_venc", { ascending: true })
        .order("hora_venc", { ascending: true, nullsFirst: true });
      if (error) throw error;
      return (data ?? []) as Tarefa[];
    },
    refetchInterval: 60_000,
  });

  const lista = useMemo(() => tarefas.data ?? [], [tarefas.data]);
  const idsLista = useMemo(() => lista.map((t) => t.id).sort(), [lista]);

  const participantes = useQuery({
    enabled: idsLista.length > 0,
    queryKey: ["tarefa-participantes", idsLista],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefa_participantes")
        .select("id, tarefa_id, user_id, status")
        .in("tarefa_id", idsLista);
      if (error) throw error;
      return (data ?? []) as Participante[];
    },
  });

  const porTarefa = useMemo(() => {
    const map = new Map<string, Participante[]>();
    for (const p of participantes.data ?? []) {
      const arr = map.get(p.tarefa_id) ?? [];
      arr.push(p);
      map.set(p.tarefa_id, arr);
    }
    return map;
  }, [participantes.data]);



  const PESO_PRIORIDADE: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
  const opcoesOrdem = useMemo<OpcaoOrdenacao<Tarefa>[]>(
    () => [
      { valor: "data", label: "Data (mais próxima)", cmp: cmpDataAsc((t) => t.data_venc) },
      { valor: "data_desc", label: "Data (mais recente)", cmp: cmpDataDesc((t) => t.data_venc) },
      { valor: "titulo", label: "Título (A-Z)", cmp: cmpTexto((t) => t.titulo) },
      {
        valor: "prioridade",
        label: "Prioridade",
        cmp: (a, b) => (PESO_PRIORIDADE[a.prioridade] ?? 9) - (PESO_PRIORIDADE[b.prioridade] ?? 9),
      },
    ],
    [],
  );
  const { rows: listaOrdenada, ordem, control: ordenarControl } = useOrdenacao(lista, opcoesOrdem);

  const grupos = useMemo(() => {
    const map = new Map<string, Tarefa[]>();
    for (const t of listaOrdenada) {
      const arr = map.get(t.data_venc) ?? [];
      arr.push(t);
      map.set(t.data_venc, arr);
    }
    const entries = [...map.entries()];
    return ordem === "data_desc"
      ? entries.sort((a, b) => b[0].localeCompare(a[0]))
      : entries.sort((a, b) => a[0].localeCompare(b[0]));
  }, [listaOrdenada, ordem]);

  const vencemAmanha = (tarefas.data ?? []).filter(
    (t) => emAberto(t.status) && t.data_venc === amanha(),
  );
  const atrasadas = (tarefas.data ?? []).filter(
    (t) => emAberto(t.status) && t.data_venc < hoje(),
  );

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["tarefas"] });
    qc.invalidateQueries({ queryKey: ["tarefa-participantes"] });
    qc.invalidateQueries({ queryKey: ["historico-tarefas"] });
  };

  /** Atualiza a fase de um destinatário e consolida o status da tarefa. */
  const atualizar = useMutation({
    mutationFn: async ({
      tarefa,
      status,
      userId,
    }: {
      tarefa: Tarefa;
      status: Status;
      userId?: string | null;
    }) => {
      const atuais = porTarefa.get(tarefa.id) ?? [];
      const alvo = userId ?? uid;

      if (status === "cancelada" || atuais.length === 0) {
        const prox =
          status === "concluida" ? proximaData(tarefa.data_venc, tarefa.recorrencia) : null;
        const patch = prox ? { status: "pendente" as Status, data_venc: prox } : { status };
        const { error } = await supabase.from("tarefas").update(patch).eq("id", tarefa.id);
        if (error) throw error;
        return prox;
      }

      const linha = atuais.find((p) => p.user_id === alvo);
      if (!linha) throw new Error("Você não é destinatário desta tarefa.");
      const { error } = await supabase
        .from("tarefa_participantes")
        .update({ status })
        .eq("id", linha.id);
      if (error) throw error;

      const novos = atuais.map((p) => (p.id === linha.id ? { ...p, status } : p));
      const todosConcluidos = novos.every((p) => p.status === "concluida");

      if (todosConcluidos) {
        const prox = proximaData(tarefa.data_venc, tarefa.recorrencia);
        if (prox) {
          const { error: e1 } = await supabase
            .from("tarefas")
            .update({ status: "pendente" as Status, data_venc: prox })
            .eq("id", tarefa.id);
          if (e1) throw e1;
          const { error: e2 } = await supabase
            .from("tarefa_participantes")
            .update({ status: "pendente" as Status })
            .eq("tarefa_id", tarefa.id);
          if (e2) throw e2;
          return prox;
        }
        const { error: e3 } = await supabase
          .from("tarefas")
          .update({ status: "concluida" as Status })
          .eq("id", tarefa.id);
        if (e3) throw e3;
        return null;
      }

      const algumAndamento = novos.some((p) => p.status !== "pendente");
      const { error: e4 } = await supabase
        .from("tarefas")
        .update({ status: (algumAndamento ? "iniciada" : "pendente") as Status })
        .eq("id", tarefa.id);
      if (e4) throw e4;
      return null;
    },
    onSuccess: (prox) => {
      if (prox) toast.success(`Recorrência: próxima data ${formatarData(prox)}.`);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarefas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa excluída.");
      invalidar();
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
              Somente tarefas criadas por você ou atribuídas a você. As concluídas ficam na aba
              Histórico.
            </p>
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
          key={responsavelInicial ?? "novo"}
          meId={me.data ?? null}
          pessoas={pessoas.data ?? []}
          responsavelInicial={responsavelInicial}
          onCriada={() => qc.invalidateQueries({ queryKey: ["tarefas"] })}
        />

        {grupos.length > 0 && <div className="flex justify-end">{ordenarControl}</div>}

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
                  <Card key={t.id} className={cn(!emAberto(t.status) && "opacity-60")}>
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
                          {t.alvo === "cliente" ? (
                            <>
                              {`Cliente: ${t.cliente_nome ?? "—"}`}
                              {t.cliente_contato && (
                                <>
                                  {" ("}
                                  <WhatsAppLink numero={t.cliente_contato} className="text-xs" />
                                  {")"}
                                </>
                              )}
                            </>
                          ) : (
                            `Responsável: ${nomePessoa(t.responsavel_id)}`
                          )}
                          {" · "}Prioridade {PRIORIDADE_LABEL[t.prioridade]}
                          {" · "}
                          {STATUS_LABEL[t.status]}
                          {t.recorrencia && t.recorrencia !== "nenhuma" && (
                            <>
                              {" · "}
                              {RECORRENCIA_LABEL[t.recorrencia]} · próxima{" "}
                              {formatarData(proximaData(t.data_venc, t.recorrencia)!)}
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {STATUS_BOTOES.map((s) => (
                          <Button
                            key={s.valor}
                            size="sm"
                            variant={t.status === s.valor ? "default" : "outline"}
                            disabled={atualizar.isPending}
                            onClick={() => atualizar.mutate({ tarefa: t, status: s.valor })}
                          >
                            {s.valor === "concluida" && <Check className="mr-1 h-3.5 w-3.5" />}
                            {s.label}
                          </Button>
                        ))}
                        {t.status !== "cancelada" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Cancelar tarefa"
                            onClick={() => atualizar.mutate({ tarefa: t, status: "cancelada" })}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}


                        {t.criador_id === me.data && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Editar"
                              onClick={() => setEditando(t)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Excluir"
                              onClick={() => excluir.mutate(t.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>

        <EditarTarefa
          tarefa={editando}
          onFechar={() => setEditando(null)}
          onSalva={() => {
            setEditando(null);
            qc.invalidateQueries({ queryKey: ["tarefas"] });
          }}
        />
      </div>
    </AppShell>
  );
}

function EditarTarefa({
  tarefa,
  onFechar,
  onSalva,
}: {
  tarefa: Tarefa | null;
  onFechar: () => void;
  onSalva: () => void;
}) {
  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    data_venc: hoje(),
    hora_venc: "",
    prioridade: "media" as Prioridade,
    cliente_nome: "",
    cliente_contato: "",
  });

  useEffect(() => {
    if (!tarefa) return;
    setForm({
      titulo: tarefa.titulo,
      descricao: tarefa.descricao ?? "",
      data_venc: tarefa.data_venc,
      hora_venc: tarefa.hora_venc?.slice(0, 5) ?? "",
      prioridade: tarefa.prioridade,
      cliente_nome: tarefa.cliente_nome ?? "",
      cliente_contato: tarefa.cliente_contato ?? "",
    });
  }, [tarefa]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!tarefa) return;
      if (form.titulo.trim().length < 2) throw new Error("Informe o título da tarefa.");
      const { error } = await supabase
        .from("tarefas")
        .update({
          titulo: form.titulo.trim(),
          descricao: form.descricao.trim() || null,
          data_venc: form.data_venc,
          hora_venc: form.hora_venc || null,
          prioridade: form.prioridade,
          cliente_nome: tarefa.alvo === "cliente" ? form.cliente_nome.trim() || null : null,
          cliente_contato: tarefa.alvo === "cliente" ? form.cliente_contato.trim() || null : null,
        })
        .eq("id", tarefa.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa atualizada.");
      onSalva();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!tarefa} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar tarefa</DialogTitle>
          <DialogDescription>Somente quem criou a tarefa pode editá-la.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Título</Label>
            <Input
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              maxLength={140}
            />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              rows={3}
            />
          </div>
          {tarefa?.alvo === "cliente" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Cliente</Label>
                <Input
                  value={form.cliente_nome}
                  onChange={(e) => setForm({ ...form, cliente_nome: e.target.value })}
                />
              </div>
              <div>
                <Label>Contato</Label>
                <Input
                  value={form.cliente_contato}
                  onChange={(e) => setForm({ ...form, cliente_contato: e.target.value })}
                />
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={form.data_venc}
                onChange={(e) => setForm({ ...form, data_venc: e.target.value })}
              />
            </div>
            <div>
              <Label>Hora</Label>
              <Input
                type="time"
                value={form.hora_venc}
                onChange={(e) => setForm({ ...form, hora_venc: e.target.value })}
              />
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select
                value={form.prioridade}
                onValueChange={(v) => setForm({ ...form, prioridade: v as Prioridade })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIORIDADE_LABEL) as Prioridade[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORIDADE_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function NovaTarefa({
  meId,
  pessoas,
  responsavelInicial,
  onCriada,
}: {
  meId: string | null;
  pessoas: { id: string; nome: string; email: string | null }[];
  responsavelInicial?: string;
  onCriada: () => void;
}) {
  const [aberto, setAberto] = useState(Boolean(responsavelInicial));
  const [alvo, setAlvo] = useState<Alvo>(responsavelInicial ? "usuario" : "propria");
  const [responsaveis, setResponsaveis] = useState<string[]>(
    responsavelInicial ? [responsavelInicial] : [],
  );

  const [clienteNome, setClienteNome] = useState("");
  const [clienteContato, setClienteContato] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState(hoje());
  const [hora, setHora] = useState("");
  const [prioridade, setPrioridade] = useState<Prioridade>("media");
  const [recorrencia, setRecorrencia] = useState<Recorrencia>("nenhuma");

  const limpar = () => {
    setAlvo("propria");
    setResponsaveis([]);
    setClienteNome("");
    setClienteContato("");
    setTitulo("");
    setDescricao("");
    setData(hoje());
    setHora("");
    setPrioridade("media");
    setRecorrencia("nenhuma");
  };

  const criar = useMutation({
    mutationFn: async () => {
      if (!meId) throw new Error("Sessão expirada.");
      const t = titulo.trim();
      if (!t) throw new Error("Informe o título da tarefa.");
      if (alvo === "usuario" && responsaveis.length === 0)
        throw new Error("Escolha ao menos um responsável.");
      if (alvo === "cliente" && !clienteNome.trim()) throw new Error("Informe o nome do cliente.");

      const alvos: string[] = alvo === "usuario" ? responsaveis : [meId];
      if (alvos.length === 0) throw new Error("Nenhum usuário disponível.");

      const linha = {
        criador_id: meId,
        alvo,
        responsavel_id: alvos[0],
        cliente_nome: alvo === "cliente" ? clienteNome.trim().slice(0, 120) : null,
        cliente_contato: alvo === "cliente" ? clienteContato.trim().slice(0, 60) || null : null,
        titulo: t.slice(0, 140),
        descricao: descricao.trim().slice(0, 1000) || null,
        data_venc: data,
        hora_venc: hora || null,
        prioridade,
        recorrencia,
      };

      const { data: criada, error } = await supabase
        .from("tarefas")
        .insert(linha)
        .select("id")
        .single();
      if (error) throw error;

      const { error: errP } = await supabase.from("tarefa_participantes").insert(
        alvos.map((uid) => ({ tarefa_id: criada.id, user_id: uid, status: "pendente" as Status })),
      );
      if (errP) throw errP;
      return alvos.length;
    },
    onSuccess: (n) => {
      toast.success(n && n > 1 ? `Tarefa criada para ${n} pessoas.` : "Tarefa criada.");

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
              <div className="flex items-center justify-between">
                <Label>Responsáveis ({responsaveis.length})</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setResponsaveis(
                      responsaveis.length === pessoas.length ? [] : pessoas.map((p) => p.id),
                    )
                  }
                >
                  {responsaveis.length === pessoas.length ? "Limpar" : "Selecionar todos"}
                </Button>
              </div>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border p-3">
                {pessoas.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum usuário disponível.</p>
                )}
                {pessoas.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={responsaveis.includes(p.id)}
                      onCheckedChange={(c) =>
                        setResponsaveis((prev) =>
                          c ? [...prev, p.id] : prev.filter((x) => x !== p.id),
                        )
                      }
                    />
                    <span>{p.nome || p.email}</span>
                  </label>
                ))}
              </div>
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

          <div className="space-y-1.5">
            <Label>Recorrência</Label>
            <Select value={recorrencia} onValueChange={(v) => setRecorrencia(v as Recorrencia)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RECORRENCIA_LABEL) as Recorrencia[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {RECORRENCIA_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {recorrencia !== "nenhuma" && (
              <p className="text-xs text-muted-foreground">
                Ao concluir, a própria tarefa avança para {formatarData(proximaData(data, recorrencia)!)}.
              </p>
            )}
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
