import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Clock, Trophy, Users, Activity, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatarMinutos, mapaTempos, useTempos } from "@/hooks/use-tempos";
import { useCanais, slugCanal } from "@/components/canais";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFaixasEquipe, rotuloFaixa } from "@/lib/faixa-atual";

const LEGADOS: Record<string, string> = {
  pagamento: "Pagamento",
  boleto: "Boleto",
  suporte: "Suporte",
  cancelamento: "Cancelamento",
  duvida: "Dúvida",
  entrega_equipamento: "Entrega de equipamento",
  reclamacao: "Reclamação",
  ativacao_configuracao: "Ativação/Configuração",
  retirada_chip: "Retirada de Chip",
};
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Linha = {
  id: string;
  nome: string;
  atendimentos: number;
  vendas: number;
  leads: number;
  posVendas: number;
  prospeccoes: number;
  tipos: Record<string, number>;
  total: number;
};

export function ProdutividadeTime() {
  const hoje = new Date();
  const [ref, setRef] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const [sel, setSel] = useState<string[] | null>(null); // null = todos
  const inicioMes = iso(ref);
  const proxMes = iso(new Date(ref.getFullYear(), ref.getMonth() + 1, 1));
  const fimMes = iso(new Date(ref.getFullYear(), ref.getMonth() + 1, 0));
  const mesAtual = ref.getFullYear() === hoje.getFullYear() && ref.getMonth() === hoje.getMonth();
  const futuro = ref > hoje;
  const diasDecorridos = mesAtual
    ? Math.max(1, hoje.getDate())
    : new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();

  const tempos = useTempos();
  const { data: tiposProd } = useCanais("produtividade");
  const tipoLabel = (t: string) =>
    (tiposProd ?? []).find((o) => slugCanal(o.nome) === t)?.nome ?? LEGADOS[t] ?? t;

  const { data, isLoading } = useQuery({
    queryKey: ["produtividade-time", inicioMes],
    queryFn: async (): Promise<Linha[]> => {
      const d0 = `${inicioMes}T00:00:00`;
      const d1 = `${proxMes}T00:00:00`;
      const [atend, loja, pap, leads, profs, pvc, pva, prosp] = await Promise.all([
        supabase.from("atendimentos").select("usuario_id, tipo").gte("data_atendimento", inicioMes).lte("data_atendimento", fimMes),
        supabase.from("vendas_loja").select("vendedor_id").gte("created_at", d0).lt("created_at", d1),
        supabase.from("vendas_pap").select("vendedor_id").gte("created_at", d0).lt("created_at", d1),
        supabase
          .from("leads")
          .select("vendedor_id, created_at, updated_at")
          .or(`and(created_at.gte.${d0},created_at.lt.${d1}),and(updated_at.gte.${d0},updated_at.lt.${d1})`),
        supabase.from("profiles").select("id, nome"),
        supabase.from("pos_venda_contatos").select("criado_por").gte("created_at", d0).lt("created_at", d1),
        supabase.from("pos_venda_ajustes").select("criado_por").gte("created_at", d0).lt("created_at", d1),
        supabase
          .from("prospeccoes")
          .select("vendedor_id")
          .gte("updated_at", d0)
          .lt("updated_at", d1)
          .or("status.not.is.null,data_contato.not.is.null,observacao.not.is.null"),
      ]);
      const nomes = new Map((profs.data ?? []).map((p) => [p.id, p.nome || "—"]));
      const linhas = new Map<string, Omit<Linha, "id" | "nome" | "total">>();
      const get = (id: string) => {
        const cur = linhas.get(id) ?? { atendimentos: 0, vendas: 0, leads: 0, posVendas: 0, prospeccoes: 0, tipos: {} };
        linhas.set(id, cur);
        return cur;
      };
      for (const a of atend.data ?? []) {
        const cur = get(a.usuario_id);
        cur.atendimentos += 1;
        cur.tipos[a.tipo] = (cur.tipos[a.tipo] ?? 0) + 1;
      }
      for (const v of [...(loja.data ?? []), ...(pap.data ?? [])]) get(v.vendedor_id).vendas += 1;
      for (const l of leads.data ?? []) {
        const c = l.created_at >= d0 && l.created_at < d1;
        const u = l.updated_at >= d0 && l.updated_at < d1 && l.updated_at.slice(0, 10) !== l.created_at.slice(0, 10);
        get(l.vendedor_id).leads += (c ? 1 : 0) + (u ? 1 : 0);
      }
      for (const c of [...(pvc.data ?? []), ...(pva.data ?? [])]) get(c.criado_por).posVendas += 1;
      for (const p of prosp.data ?? []) get(p.vendedor_id).prospeccoes += 1;
      return [...linhas.entries()].map(([id, v]) => ({
        id,
        nome: nomes.get(id) ?? "—",
        ...v,
        total: v.atendimentos + v.vendas + v.leads + v.posVendas + v.prospeccoes,
      }));
    },
  });

  const mapa = mapaTempos(tempos.data);
  const minutosDe = (l: Linha) =>
    Object.entries(l.tipos).reduce((s, [t, n]) => s + n * (mapa.get(t) ?? 0), 0) +
    l.vendas * (mapa.get("venda") ?? 0) +
    l.leads * (mapa.get("lead") ?? 0) +
    l.posVendas * (mapa.get("pos_venda") ?? 5) +
    l.prospeccoes * (mapa.get("prospeccao") ?? 5);

  const todos = useMemo(() => [...(data ?? [])].sort((a, b) => a.nome.localeCompare(b.nome)), [data]);
  const linhas = useMemo(
    () =>
      todos
        .filter((l) => !sel || sel.includes(l.id))
        .map((l) => ({ ...l, minutos: minutosDe(l) }))
        .sort((a, b) => b.minutos - a.minutos),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todos, sel, tempos.data],
  );
  const faixas = useFaixasEquipe(linhas.map((l) => l.id), inicioMes);

  const minutosTime = linhas.reduce((s, l) => s + l.minutos, 0);
  const totalAcoes = linhas.reduce((s, l) => s + l.total, 0);
  const maxMin = Math.max(1, ...linhas.map((l) => l.minutos));

  const topTipos = useMemo(() => {
    const m = new Map<string, number>();
    const add = (k: string, n: number) => n && m.set(k, (m.get(k) ?? 0) + n);
    for (const l of linhas) {
      for (const [t, n] of Object.entries(l.tipos)) add(tipoLabel(t), n);
      add("Vendas registradas", l.vendas);
      add("Leads", l.leads);
      add("Pós vendas", l.posVendas);
      add("Prospecções", l.prospeccoes);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, tiposProd]);
  const maxTipo = Math.max(1, ...topTipos.map((t) => t[1]));

  const mudarMes = (d: number) => {
    setRef(new Date(ref.getFullYear(), ref.getMonth() + d, 1));
  };
  const toggle = (id: string) => {
    const base = sel ?? todos.map((t) => t.id);
    setSel(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Produtividade</h1>
          <p className="mt-1 text-sm text-muted-foreground">Acompanhe o tempo produtivo e as atuações da sua equipe.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border border-border">
            <Button variant="ghost" size="icon" onClick={() => mudarMes(-1)} aria-label="Mês anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="w-36 text-center text-sm font-medium">
              {MESES[ref.getMonth()]} {ref.getFullYear()}
            </span>
            <Button variant="ghost" size="icon" onClick={() => mudarMes(1)} disabled={mesAtual} aria-label="Próximo mês">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <Users className="mr-2 h-4 w-4" />
                {sel === null ? "Todos os consultores" : `${sel.length} consultor(es)`}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-2">
              <div className="mb-2 flex justify-between px-1 text-xs">
                <button className="text-primary hover:underline" onClick={() => setSel(null)}>Todos</button>
                <button className="text-primary hover:underline" onClick={() => setSel([])}>Nenhum</button>
              </div>
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {todos.length === 0 && <p className="px-1 text-sm text-muted-foreground">Sem atividade no mês.</p>}
                {todos.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
                    <Checkbox checked={sel === null || sel.includes(t.id)} onCheckedChange={() => toggle(t.id)} />
                    <span className="truncate">{t.nome}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {futuro ? null : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Resumo icon={Clock} titulo="Tempo produtivo no mês" valor={formatarMinutos(minutosTime)} />
          <Resumo icon={Activity} titulo="Média do time por dia" valor={formatarMinutos(minutosTime / diasDecorridos)} sub={`${diasDecorridos} dias ${mesAtual ? "decorridos" : "no mês"}`} />
          <Resumo icon={ListChecks} titulo="Total de atuações" valor={String(totalAcoes)} sub={`${(totalAcoes / diasDecorridos).toFixed(1)}/dia`} />
          <Resumo
            icon={Users}
            titulo="Média por consultor"
            valor={formatarMinutos(linhas.length ? minutosTime / linhas.length : 0)}
            sub={`${linhas.length} consultor(es) com atividade`}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-primary" /> Ranking de produtividade</CardTitle>
            <CardDescription>Ordenado pelo tempo produtivo acumulado no mês.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading && <Skeleton className="h-24 w-full" />}
            {!isLoading && linhas.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma atividade registrada neste mês.</p>
            )}
            {linhas.map((l, i) => {
              const f = faixas.data?.get(l.id);
              return (
                <div key={l.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center gap-3">
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${i < 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {i + 1}º
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{l.nome}</span>
                        {f && (
                          <Badge variant="outline" className="text-[11px] font-semibold">
                            {f.canal === "pap" ? "PAP" : "Loja"} · {rotuloFaixa(f)}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {l.atendimentos} atend. · {l.vendas} vendas · {l.leads} leads · {l.posVendas} pós vendas · {l.prospeccoes} prospecções
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-base font-bold leading-none">{formatarMinutos(l.minutos)}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {formatarMinutos(l.minutos / diasDecorridos)}/dia · {l.total} atuações
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(l.minutos / maxMin) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Maiores tipos de atuação</CardTitle>
            <CardDescription>O que a equipe mais fez no mês.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topTipos.length === 0 && <p className="text-sm text-muted-foreground">Sem registros.</p>}
            {topTipos.map(([nome, n]) => (
              <div key={nome}>
                <div className="flex justify-between text-sm">
                  <span className="truncate">{nome}</span>
                  <span className="font-semibold">{n}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary/80" style={{ width: `${(n / maxTipo) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Resumo({ icon: Icon, titulo, valor, sub }: { icon: typeof Clock; titulo: string; valor: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" /> {titulo}</div>
        <div className="mt-1 text-2xl font-bold">{valor}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
