import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Activity, ClipboardList, ShoppingBag, Timer, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { WhatsAppLink } from "@/components/whatsapp-link";
import { useOrdenacao, cmpTexto, cmpDataDesc, type OpcaoOrdenacao } from "@/components/ordenacao";
import { formatarMinutos, mapaTempos, useTempos } from "@/hooks/use-tempos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


export const Route = createFileRoute("/_authenticated/produtividade")({
  head: () => ({
    meta: [
      { title: "Produtividade — Unifique Comercial" },
      {
        name: "description",
        content: "Registre os atendimentos do dia e acompanhe sua produtividade diária no mês.",
      },
      { property: "og:title", content: "Produtividade — Unifique Comercial" },
      {
        property: "og:description",
        content: "Atendimentos, vendas e leads consolidados por dia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Produtividade,
});

const TIPOS = [
  { value: "pagamento", label: "Pagamento" },
  { value: "boleto", label: "Boleto" },
  { value: "suporte", label: "Suporte" },
  { value: "cancelamento", label: "Cancelamento" },
  { value: "duvida", label: "Dúvida" },
  { value: "entrega_equipamento", label: "Entrega de equipamento" },
  { value: "reclamacao", label: "Reclamação" },
  { value: "ativacao_configuracao", label: "Ativação/Configuração" },
  { value: "retirada_chip", label: "Retirada de Chip" },
] as const;

type Tipo = (typeof TIPOS)[number]["value"];

const tipoLabel = (t: string) => TIPOS.find((x) => x.value === t)?.label ?? t;
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const diaCurto = (s: string) => {
  const [, m, d] = s.split("-");
  return `${d}/${m}`;
};

function Produtividade() {
  const qc = useQueryClient();
  const hoje = new Date();
  const inicioMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
  const fimMes = iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0));

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<Tipo>("suporte");
  const [contato, setContato] = useState("");
  const [data, setData] = useState(iso(hoje));
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const diasDecorridos = Math.max(1, hoje.getDate());

  function limparForm() {
    setEditandoId(null);
    setNome("");
    setContato("");
    setTipo("suporte");
    setData(iso(new Date()));
  }

  const { data: prod, isLoading } = useQuery({
    queryKey: ["produtividade", inicioMes],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user!.id;
      const [atend, loja, pap, leads] = await Promise.all([
        supabase
          .from("atendimentos")
          .select("id, nome_cliente, tipo, contato_cliente, data_atendimento, created_at")
          .eq("usuario_id", uid)
          .gte("data_atendimento", inicioMes)
          .lte("data_atendimento", fimMes)
          .order("created_at", { ascending: false }),
        supabase
          .from("vendas_loja")
          .select("id, created_at")
          .eq("vendedor_id", uid)
          .gte("created_at", `${inicioMes}T00:00:00`),
        supabase
          .from("vendas_pap")
          .select("id, created_at")
          .eq("vendedor_id", uid)
          .gte("created_at", `${inicioMes}T00:00:00`),
        supabase
          .from("leads")
          .select("id, created_at, updated_at")
          .eq("vendedor_id", uid)
          .or(`created_at.gte.${inicioMes}T00:00:00,updated_at.gte.${inicioMes}T00:00:00`),
      ]);

      const atendimentos = atend.data ?? [];
      const dias = new Map<
        string,
        { atendimentos: number; vendas: number; leads: number }
      >();
      const bump = (dia: string, k: "atendimentos" | "vendas" | "leads") => {
        if (dia < inicioMes || dia > fimMes) return;
        const cur = dias.get(dia) ?? { atendimentos: 0, vendas: 0, leads: 0 };
        cur[k] += 1;
        dias.set(dia, cur);
      };

      for (const a of atendimentos) bump(a.data_atendimento, "atendimentos");
      for (const v of [...(loja.data ?? []), ...(pap.data ?? [])])
        bump(iso(new Date(v.created_at)), "vendas");
      for (const l of leads.data ?? []) {
        const criado = iso(new Date(l.created_at));
        bump(criado, "leads");
        const mov = iso(new Date(l.updated_at));
        if (mov !== criado) bump(mov, "leads");
      }

      const linhas = [...dias.entries()]
        .map(([dia, v]) => ({ dia, ...v, total: v.atendimentos + v.vendas + v.leads }))
        .sort((a, b) => (a.dia < b.dia ? 1 : -1));

      return {
        atendimentos,
        linhas,
        totais: linhas.reduce(
          (s, l) => ({
            atendimentos: s.atendimentos + l.atendimentos,
            vendas: s.vendas + l.vendas,
            leads: s.leads + l.leads,
            total: s.total + l.total,
          }),
          { atendimentos: 0, vendas: 0, leads: 0, total: 0 },
        ),
      };
    },
  });

  type Atendimento = NonNullable<typeof prod>["atendimentos"][number];
  const opcoesOrdem = useMemo<OpcaoOrdenacao<Atendimento>[]>(
    () => [
      { valor: "data", label: "Data (mais recente)", cmp: cmpDataDesc((a) => a.data_atendimento) },
      { valor: "cliente", label: "Cliente (A-Z)", cmp: cmpTexto((a) => a.nome_cliente) },
      { valor: "tipo", label: "Tipo (A-Z)", cmp: cmpTexto((a) => a.tipo) },
    ],
    [],
  );
  const { rows: atendimentosOrdenados, control: ordenarControl } = useOrdenacao(
    prod?.atendimentos ?? [],
    opcoesOrdem,
  );

  const maxTotal = useMemo(
    () => Math.max(1, ...(prod?.linhas ?? []).map((l) => l.total)),
    [prod],
  );

  const tempos = useTempos();
  const { data: roles } = useQuery({
    queryKey: ["meus-roles-produtividade"],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", sess.user!.id);
      return (data ?? []).map((r) => r.role as string);
    },
  });
  const isMaster = !!roles?.some((r) => r === "regional" || r === "admin");

  const minutosMes = useMemo(() => {
    const mapa = mapaTempos(tempos.data);
    const atend = (prod?.atendimentos ?? []).reduce(
      (s, a) => s + (mapa.get(a.tipo) ?? 0),
      0,
    );
    return (
      atend +
      (prod?.totais.vendas ?? 0) * (mapa.get("venda") ?? 0) +
      (prod?.totais.leads ?? 0) * (mapa.get("lead") ?? 0)
    );
  }, [prod, tempos.data]);


  const criar = useMutation({
    mutationFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user!.id;
      if (nome.trim().length < 2) throw new Error("Informe o nome do cliente.");
      const { error } = await supabase.from("atendimentos").insert({
        usuario_id: uid,
        nome_cliente: nome.trim(),
        tipo,
        contato_cliente: contato.trim() || null,
        data_atendimento: data,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atendimento registrado.");
      setNome("");
      setContato("");
      qc.invalidateQueries({ queryKey: ["produtividade"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao registrar atendimento."),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("atendimentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atendimento removido.");
      qc.invalidateQueries({ queryKey: ["produtividade"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao remover."),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Produtividade</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Registre os atendimentos realizados no dia e acompanhe o acumulado do mês.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat
          title="Atendimentos"
          value={prod?.totais.atendimentos}
          media={(prod?.totais.atendimentos ?? 0) / diasDecorridos}
          loading={isLoading}
          icon={ClipboardList}
        />
        <Stat
          title="Vendas"
          value={prod?.totais.vendas}
          media={(prod?.totais.vendas ?? 0) / diasDecorridos}
          loading={isLoading}
          icon={ShoppingBag}
        />
        <Stat
          title="Leads"
          value={prod?.totais.leads}
          media={(prod?.totais.leads ?? 0) / diasDecorridos}
          loading={isLoading}
          icon={Users}
        />
        <Stat
          title="Produtividade total"
          value={prod?.totais.total}
          media={(prod?.totais.total ?? 0) / diasDecorridos}
          loading={isLoading}
          icon={Activity}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Tempo produtivo
          </CardTitle>
          <Timer className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent className="flex flex-wrap gap-8">
          <div>
            <div className="text-2xl font-bold">{formatarMinutos(minutosMes)}</div>
            <p className="mt-1 text-xs text-muted-foreground">Acumulado do mês</p>
          </div>
          <div>
            <div className="text-2xl font-bold">
              {formatarMinutos(minutosMes / diasDecorridos)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Média por dia</p>
          </div>
        </CardContent>
      </Card>

      {isMaster && <TemposConfig />}


      <Card>
        <CardHeader>
          <CardTitle>Novo atendimento</CardTitle>
          <CardDescription>Preencha os dados do atendimento realizado.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              criar.mutate();
            }}
          >
            <div className="sm:col-span-2">
              <Label htmlFor="cliente">Nome do cliente</Label>
              <Input
                id="cliente"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={120}
                placeholder="Nome completo"
              />
            </div>
            <div>
              <Label>Tipo de atendimento</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as Tipo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="contato">Contato do cliente</Label>
              <Input
                id="contato"
                value={contato}
                onChange={(e) => setContato(e.target.value)}
                maxLength={120}
                placeholder="Telefone, WhatsApp ou e-mail"
              />
            </div>
            <div>
              <Label htmlFor="data">Data</Label>
              <Input id="data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="flex items-end justify-end sm:col-span-2">
              <Button type="submit" disabled={criar.isPending}>
                {criar.isPending ? "Salvando..." : "Registrar atendimento"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acumulado por dia — mês atual</CardTitle>
          <CardDescription>Atendimentos + vendas + leads registrados ou movimentados.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <Skeleton className="h-32 w-full" />}
          {!isLoading && (prod?.linhas.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma atividade registrada neste mês.</p>
          )}
          {(prod?.linhas ?? []).map((l) => (
            <div key={l.dia} className="flex items-center gap-3">
              <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground">
                {diaCurto(l.dia)}
              </span>
              <div className="h-6 flex-1 overflow-hidden rounded bg-muted">
                <div
                  className="h-full rounded bg-primary/80"
                  style={{ width: `${(l.total / maxTotal) * 100}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-sm font-semibold">{l.total}</span>
              <span className="hidden w-44 shrink-0 text-right text-xs text-muted-foreground sm:block">
                {l.atendimentos} atend. · {l.vendas} vendas · {l.leads} leads
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle>Atendimentos do mês</CardTitle>
          {(prod?.atendimentos.length ?? 0) > 0 && ordenarControl}
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <Skeleton className="h-24 w-full" />}
          {!isLoading && (prod?.atendimentos.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum atendimento registrado ainda.</p>
          )}
          {atendimentosOrdenados.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3"
            >
              <span className="text-xs text-muted-foreground">{diaCurto(a.data_atendimento)}</span>
              <span className="font-medium">{a.nome_cliente}</span>
              <Badge variant="secondary">{tipoLabel(a.tipo)}</Badge>
              {a.contato_cliente && (
                <WhatsAppLink numero={a.contato_cliente} className="text-xs" />
              )}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => excluir.mutate(a.id)}
              >
                Excluir
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  title,
  value,
  media,
  loading,
  icon: Icon,
}: {
  title: string;
  value?: number;
  media?: number;
  loading: boolean;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <>
            <div className="text-2xl font-bold">{value ?? 0}</div>
            {media !== undefined && (
              <p className="mt-1 text-xs text-muted-foreground">
                Média diária: {media.toFixed(1)}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TemposConfig() {
  const qc = useQueryClient();
  const tempos = useTempos();
  const [valores, setValores] = useState<Record<string, string>>({});

  useEffect(() => {
    if (tempos.data) {
      setValores(Object.fromEntries(tempos.data.map((t) => [t.chave, String(t.minutos)])));
    }
  }, [tempos.data]);

  const salvar = useMutation({
    mutationFn: async () => {
      const linhas = (tempos.data ?? []).map((t) => ({
        chave: t.chave,
        minutos: Number(valores[t.chave] ?? t.minutos) || 0,
      }));
      for (const l of linhas) {
        const { error } = await supabase
          .from("parametros_tempos")
          .update({ minutos: l.minutos })
          .eq("chave", l.chave);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Tempos médios atualizados.");
      qc.invalidateQueries({ queryKey: ["parametros-tempos"] });
      qc.invalidateQueries({ queryKey: ["produtividade"] });
      qc.invalidateQueries({ queryKey: ["produtividade-time"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar tempos."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tempos médios de produtividade</CardTitle>
        <CardDescription>
          Defina, em minutos, o tempo médio de cada tipo de atendimento, de cada venda e de cada
          lead. Esses valores alimentam o "Tempo produtivo" de todos os usuários.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tempos.isLoading && <Skeleton className="h-40 w-full" />}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(tempos.data ?? []).map((t) => (
            <div key={t.chave}>
              <Label htmlFor={`t-${t.chave}`}>{t.label}</Label>
              <Input
                id={`t-${t.chave}`}
                type="number"
                min={0}
                step="1"
                value={valores[t.chave] ?? ""}
                onChange={(e) => setValores((v) => ({ ...v, [t.chave]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando..." : "Salvar tempos"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
