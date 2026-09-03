// Aba "Estratégico" do dashboard: seleção múltipla de cidades e meses,
// indicadores de Banda Larga e Móvel e KPIs em gráfico de linhas ou colunas.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const AZUL = "#1e3a8a";
const ROXO = "#ea580c";

export const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type Mensal = {
  id: string;
  cidade_id: string;
  mes: number;
  vendas: number;
  meta_vendas: number;
  quebra_venda: number;
  vendas_brutas: number;
  ativacoes: number;
  meta_ativacoes: number;
  acessos_anatel: number;
  cancel_voluntario: number;
  cancel_involuntario: number;
  market_share: number;
  mv_linhas_vendidas: number;
  mv_meta_vendidas: number;
  mv_linhas_ativadas: number;
  mv_meta_ativadas: number;
  mv_acessos_anatel: number;
  mv_cancel_voluntario: number;
  mv_cancel_involuntario: number;
  mv_market_share: number;
};

type Cidade = {
  id: string;
  cidade: string;
  unidade: string;
  regional: string;
  ano: number;
  portas_total: number;
  portas_ocupadas: number;
  owner_id: string;
};




const num = (n: number) => (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const pct = (n: number) => `${((n || 0) * 100).toFixed(1).replace(".", ",")}%`;
const anosDisponiveis = () => {
  const y = new Date().getFullYear();
  return [y + 1, y, y - 1, y - 2];
};

/** Agregação de um conjunto de linhas mensais. */
function agregar(rows: Mensal[]) {
  const acc = rows.reduce(
    (s, r) => ({
      vendas: s.vendas + Number(r.vendas),
      metaVendas: s.metaVendas + Number(r.meta_vendas),
      quebra: s.quebra + Number(r.quebra_venda),
      brutas: s.brutas + Number(r.vendas_brutas),
      ativacoes: s.ativacoes + Number(r.ativacoes),
      metaAtivacoes: s.metaAtivacoes + Number(r.meta_ativacoes),
      anatel: s.anatel + Number(r.acessos_anatel),
      cvol: s.cvol + Number(r.cancel_voluntario),
      cinv: s.cinv + Number(r.cancel_involuntario),
      share: s.share + Number(r.market_share),
      nShare: s.nShare + (Number(r.market_share) > 0 ? 1 : 0),
      mvVendidas: s.mvVendidas + Number(r.mv_linhas_vendidas),
      mvMetaVendidas: s.mvMetaVendidas + Number(r.mv_meta_vendidas),
      mvAtivadas: s.mvAtivadas + Number(r.mv_linhas_ativadas),
      mvMetaAtivadas: s.mvMetaAtivadas + Number(r.mv_meta_ativadas),
      mvAnatel: s.mvAnatel + Number(r.mv_acessos_anatel),
      mvCvol: s.mvCvol + Number(r.mv_cancel_voluntario),
      mvCinv: s.mvCinv + Number(r.mv_cancel_involuntario),
      mvShare: s.mvShare + Number(r.mv_market_share),
      nMvShare: s.nMvShare + (Number(r.mv_market_share) > 0 ? 1 : 0),
    }),
    {
      vendas: 0, metaVendas: 0, quebra: 0, brutas: 0, ativacoes: 0, metaAtivacoes: 0,
      anatel: 0, cvol: 0, cinv: 0, share: 0, nShare: 0, mvVendidas: 0, mvMetaVendidas: 0,
      mvAtivadas: 0, mvMetaAtivadas: 0, mvAnatel: 0, mvCvol: 0, mvCinv: 0, mvShare: 0, nMvShare: 0,
    },
  );
  const cancel = acc.cvol + acc.cinv;
  const mvCancel = acc.mvCvol + acc.mvCinv;
  return {
    ...acc,
    cancel,
    mvCancel,
    pctVendas: acc.metaVendas ? acc.vendas / acc.metaVendas : 0,
    pctAtivacoes: acc.metaAtivacoes ? acc.ativacoes / acc.metaAtivacoes : 0,
    churnVol: acc.anatel ? acc.cvol / acc.anatel : 0,
    churnInv: acc.anatel ? acc.cinv / acc.anatel : 0,
    churnGeral: acc.anatel ? cancel / acc.anatel : 0,
    liquidas: acc.ativacoes - cancel,
    marketShare: acc.nShare ? acc.share / acc.nShare : 0,
    mvPctVendidas: acc.mvMetaVendidas ? acc.mvVendidas / acc.mvMetaVendidas : 0,
    mvPctAtivadas: acc.mvMetaAtivadas ? acc.mvAtivadas / acc.mvMetaAtivadas : 0,
    mvChurnVol: acc.mvAnatel ? acc.mvCvol / acc.mvAnatel : 0,
    mvChurnInv: acc.mvAnatel ? acc.mvCinv / acc.mvAnatel : 0,
    mvChurnGeral: acc.mvAnatel ? mvCancel / acc.mvAnatel : 0,
    mvLiquidas: acc.mvAtivadas - mvCancel,
    mvMarketShare: acc.nMvShare ? acc.mvShare / acc.nMvShare : 0,
  };
}

export function Estrategico() {
  const qc = useQueryClient();
  const [ano, setAno] = useState(new Date().getFullYear());
  const [cidadesSel, setCidadesSel] = useState<string[] | null>(null);
  const [mesesSel, setMesesSel] = useState<number[]>(
    Array.from({ length: new Date().getMonth() + 1 }, (_, i) => i + 1),
  );
  const [tipoGrafico, setTipoGrafico] = useState<"linha" | "coluna">("linha");
  const [mesEdicao, setMesEdicao] = useState(new Date().getMonth() + 1);
  const [novaCidade, setNovaCidade] = useState("");
  const [abrirNova, setAbrirNova] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["estrategico", ano],
    queryFn: async () => {
      const { data: cidades, error } = await supabase
        .from("estrategico_cidades")
        .select("id, cidade, unidade, regional, ano, portas_total, portas_ocupadas, owner_id")
        .eq("ano", ano)
        .order("cidade");
      if (error) throw error;
      const ids = (cidades ?? []).map((c) => c.id);
      let mensais: Mensal[] = [];
      if (ids.length) {
        const { data: m, error: e2 } = await supabase
          .from("estrategico_mensal")
          .select("*")
          .in("cidade_id", ids);
        if (e2) throw e2;
        mensais = (m ?? []) as unknown as Mensal[];
      }
      return { cidades: (cidades ?? []) as unknown as Cidade[], mensais };
    },
  });

  const cidades = useMemo(() => data?.cidades ?? [], [data]);
  const mensais = useMemo(() => data?.mensais ?? [], [data]);
  const idsSel = cidadesSel ?? cidades.map((c) => c.id);
  const idsSelKey = idsSel.join(",");

  const linha = (cidadeId: string, m: number) =>
    mensais.find((x) => x.cidade_id === cidadeId && x.mes === m);

  const salvarMensal = useMutation({
    mutationFn: async (p: { cidade_id: string; mes: number; campo: string; valor: number }) => {
      const atual = linha(p.cidade_id, p.mes);
      if (atual) {
        const { error } = await supabase
          .from("estrategico_mensal")
          .update({ [p.campo]: p.valor } as never)
          .eq("id", atual.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("estrategico_mensal")
          .insert({ cidade_id: p.cidade_id, mes: p.mes, [p.campo]: p.valor } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estrategico", ano] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const salvarCidade = useMutation({
    mutationFn: async (p: { id: string; campo: string; valor: number | string }) => {
      const { error } = await supabase
        .from("estrategico_cidades")
        .update({ [p.campo]: p.valor } as never)
        .eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estrategico", ano] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const criarCidade = useMutation({
    mutationFn: async (nome: string) => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) throw new Error("Sessão expirada. Entre novamente.");
      const { error } = await supabase
        .from("estrategico_cidades")
        .insert({ cidade: nome.trim(), ano, owner_id: uid });
      if (error) throw error;
    },
    onSuccess: () => {
      setNovaCidade("");
      setAbrirNova(false);
      toast.success("Cidade adicionada");
      qc.invalidateQueries({ queryKey: ["estrategico", ano] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirCidade = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("estrategico_cidades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cidade removida");
      qc.invalidateQueries({ queryKey: ["estrategico", ano] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Série anual (12 meses) das cidades selecionadas, com Net Ads mês a mês. */
  const serieAno = useMemo(() => {
    const sel = new Set(idsSel);
    const base = MESES.map((label, i) => {
      const rows = mensais.filter((x) => x.mes === i + 1 && sel.has(x.cidade_id));
      return { mes: label, num: i + 1, ...agregar(rows) };
    });
    return base.map((r, i, arr) => ({
      ...r,
      netAds: i > 0 && arr[i - 1].anatel && r.anatel ? r.anatel - arr[i - 1].anatel : 0,
      mvNetAds: i > 0 && arr[i - 1].mvAnatel && r.mvAnatel ? r.mvAnatel - arr[i - 1].mvAnatel : 0,
    }));
  }, [mensais, idsSelKey]);

  const serie = useMemo(
    () => serieAno.filter((s) => mesesSel.includes(s.num)),
    [serieAno, mesesSel],
  );

  /** Consolidado do período (cidades x meses selecionados). */
  const total = useMemo(() => {
    const sel = new Set(idsSel);
    const rows = mensais.filter((x) => sel.has(x.cidade_id) && mesesSel.includes(x.mes));
    const t = agregar(rows);
    return {
      ...t,
      netAds: serie.reduce((s, r) => s + r.netAds, 0),
      mvNetAds: serie.reduce((s, r) => s + r.mvNetAds, 0),
      anatel: serie.length ? serie[serie.length - 1].anatel : 0,
      mvAnatel: serie.length ? serie[serie.length - 1].mvAnatel : 0,
      churnGeral: serie.length
        ? serie.reduce((s, r) => s + r.churnGeral, 0) / serie.length
        : 0,
      mvChurnGeral: serie.length
        ? serie.reduce((s, r) => s + r.mvChurnGeral, 0) / serie.length
        : 0,
    };
  }, [mensais, idsSelKey, mesesSel, serie]);

  const portas = cidades
    .filter((c) => idsSel.includes(c.id))
    .reduce(
      (s, c) => ({
        total: s.total + Number(c.portas_total),
        ocupadas: s.ocupadas + Number(c.portas_ocupadas),
      }),
      { total: 0, ocupadas: 0 },
    );
  const ocupacao = portas.total ? portas.ocupadas / portas.total : 0;

  const dadosChurn = serie.map((s) => ({
    mes: s.mes,
    "Churn geral": Number((s.churnGeral * 100).toFixed(2)),
    "Churn geral móvel": Number((s.mvChurnGeral * 100).toFixed(2)),
  }));

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  const G = (props: { titulo: string; series: { key: string; nome: string; cor: string }[]; dados: Record<string, unknown>[]; unidade?: string }) => (
    <Grafico titulo={props.titulo}>
      {tipoGrafico === "linha" ? (
        <LineChart data={props.dados}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="mes" fontSize={12} />
          <YAxis fontSize={12} unit={props.unidade} />
          <Tooltip />
          <Legend />
          {props.series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.nome} stroke={s.cor} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      ) : (
        <BarChart data={props.dados}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="mes" fontSize={12} />
          <YAxis fontSize={12} unit={props.unidade} />
          <Tooltip />
          <Legend />
          {props.series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.nome} fill={s.cor} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      )}
    </Grafico>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Ano</Label>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anosDisponiveis().map((a) => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Cidades</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[220px] justify-between font-normal">
                  {cidadesSel === null || cidadesSel.length === cidades.length
                    ? "Todas as cidades"
                    : `${cidadesSel.length} selecionada(s)`}
                  <ChevronDown className="h-4 w-4 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="max-h-72 w-[260px] overflow-y-auto p-2" align="start">
                <button
                  type="button"
                  className="mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  onClick={() =>
                    setCidadesSel(
                      cidadesSel && cidadesSel.length === 0 ? cidades.map((c) => c.id) : [],
                    )
                  }
                >
                  <Check className="h-4 w-4 opacity-60" />
                  {cidadesSel && cidadesSel.length === 0 ? "Marcar todas" : "Limpar seleção"}
                </button>
                {cidades.map((c) => {
                  const marcado = idsSel.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        checked={marcado}
                        onCheckedChange={() =>
                          setCidadesSel(
                            marcado
                              ? idsSel.filter((id) => id !== c.id)
                              : [...idsSel, c.id],
                          )
                        }
                      />
                      {c.cidade}
                    </label>
                  );
                })}
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Meses</Label>
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                size="sm"
                variant={mesesSel.length === 12 ? "default" : "outline"}
                onClick={() =>
                  setMesesSel(mesesSel.length === 12 ? [] : MESES.map((_, i) => i + 1))
                }
              >
                Todos
              </Button>
              {MESES.map((m, i) => {
                const ativo = mesesSel.includes(i + 1);
                return (
                  <Button
                    key={m}
                    type="button"
                    size="sm"
                    variant={ativo ? "default" : "outline"}
                    onClick={() =>
                      setMesesSel(
                        ativo ? mesesSel.filter((x) => x !== i + 1) : [...mesesSel, i + 1].sort((a, b) => a - b),
                      )
                    }
                  >
                    {m}
                  </Button>
                );
              })}
            </div>
          </div>

          <Dialog open={abrirNova} onOpenChange={setAbrirNova}>
            <DialogTrigger asChild>
              <Button variant="outline" className="ml-auto">
                <Plus className="mr-2 h-4 w-4" /> Nova cidade
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Adicionar cidade</DialogTitle></DialogHeader>
              <div className="space-y-2">
                <Label>Nome da cidade</Label>
                <Input
                  value={novaCidade}
                  onChange={(e) => setNovaCidade(e.target.value)}
                  placeholder="Ex.: Garuva"
                />
              </div>
              <DialogFooter>
                <Button
                  disabled={!novaCidade.trim() || criarCidade.isPending}
                  onClick={() => criarCidade.mutate(novaCidade)}
                >
                  Adicionar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Banda Larga
        </h3>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          <Kpi title="Portas ocupadas" value={num(portas.ocupadas)} hint={`${num(portas.total)} portas · ${pct(ocupacao)} ocupação`} />
          <Kpi title="Vendas" value={num(total.vendas)} hint={`Meta ${num(total.metaVendas)} · ${pct(total.pctVendas)}`} />
          <Kpi title="Quebra de vendas" value={num(total.quebra)} hint={`Brutas ${num(total.brutas)}`} />
          <Kpi title="Ativações" value={num(total.ativacoes)} hint={`Meta ${num(total.metaAtivacoes)} · ${pct(total.pctAtivacoes)}`} />
          <Kpi title="Acessos Anatel" value={num(total.anatel)} hint="Base no último mês do período" />
          <Kpi title="Cancelamentos" value={num(total.cancel)} hint={`Vol. ${num(total.cvol)} · Invol. ${num(total.cinv)}`} />
          <Kpi title="Churn geral" value={pct(total.churnGeral)} hint="Média do período" />
          <Kpi title="Ativações líquidas" value={num(total.liquidas)} hint="Ativações − cancelamentos" />
          <Kpi title="Net Ads" value={num(total.netAds)} hint="Variação de acessos Anatel" />
          <Kpi title="Market share" value={pct(total.marketShare)} hint="Média das cidades" />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Móvel
        </h3>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          <Kpi title="Linhas vendidas" value={num(total.mvVendidas)} hint={`Meta ${num(total.mvMetaVendidas)} · ${pct(total.mvPctVendidas)}`} />
          <Kpi title="Linhas ativas" value={num(total.mvAtivadas)} hint={`Meta ${num(total.mvMetaAtivadas)} · ${pct(total.mvPctAtivadas)}`} />
          <Kpi title="Acessos Anatel" value={num(total.mvAnatel)} hint="Base no último mês do período" />
          <Kpi title="Linhas canceladas" value={num(total.mvCancel)} hint={`Vol. ${num(total.mvCvol)} · Invol. ${num(total.mvCinv)}`} />
          <Kpi title="Churn geral" value={pct(total.mvChurnGeral)} hint="Média do período" />
          <Kpi title="Ativações líquidas" value={num(total.mvLiquidas)} hint="Ativadas − canceladas" />
          <Kpi title="Net Ads" value={num(total.mvNetAds)} hint="Variação de acessos Anatel" />
          <Kpi title="Market share" value={pct(total.mvMarketShare)} hint="Média das cidades" />
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Visualização:</span>
        {(["linha", "coluna"] as const).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tipoGrafico === t ? "default" : "outline"}
            onClick={() => setTipoGrafico(t)}
          >
            {t === "linha" ? "Gráfico de linhas" : "Colunas"}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <G titulo="Banda Larga · Vendas x Meta" dados={serie} series={[{ key: "metaVendas", nome: "Meta", cor: ROXO }, { key: "vendas", nome: "Vendas", cor: AZUL }]} />
        <G titulo="Móvel · Linhas vendidas x Meta" dados={serie} series={[{ key: "mvMetaVendidas", nome: "Meta", cor: ROXO }, { key: "mvVendidas", nome: "Linhas vendidas", cor: AZUL }]} />

        <G titulo="Banda Larga · Ativação x Meta" dados={serie} series={[{ key: "metaAtivacoes", nome: "Meta", cor: ROXO }, { key: "ativacoes", nome: "Ativações", cor: AZUL }]} />
        <G titulo="Móvel · Ativação x Meta" dados={serie} series={[{ key: "mvMetaAtivadas", nome: "Meta", cor: ROXO }, { key: "mvAtivadas", nome: "Linhas ativadas", cor: AZUL }]} />

        <G titulo="Banda Larga · Churn geral" unidade="%" dados={dadosChurn} series={[{ key: "Churn geral", nome: "Churn geral", cor: AZUL }]} />
        <G titulo="Móvel · Churn geral" unidade="%" dados={dadosChurn} series={[{ key: "Churn geral móvel", nome: "Churn geral", cor: ROXO }]} />

        <G titulo="Banda Larga · Acessos Anatel" dados={serie} series={[{ key: "anatel", nome: "Acessos", cor: AZUL }]} />
        <G titulo="Móvel · Acessos Anatel" dados={serie} series={[{ key: "mvAnatel", nome: "Acessos", cor: ROXO }]} />

        <G titulo="Banda Larga · Cancelamentos totais" dados={serie} series={[{ key: "cancel", nome: "Cancelamentos", cor: AZUL }]} />
        <G titulo="Móvel · Cancelamentos totais" dados={serie} series={[{ key: "mvCancel", nome: "Linhas canceladas", cor: ROXO }]} />

        <G titulo="Banda Larga · Net Ads" dados={serie} series={[{ key: "netAds", nome: "Net Ads", cor: AZUL }]} />
        <G titulo="Móvel · Net Ads" dados={serie} series={[{ key: "mvNetAds", nome: "Net Ads", cor: ROXO }]} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Indicadores de portas</CardTitle>
          <CardDescription>Edite os valores diretamente na tabela.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2">Cidade</th>
                <th className="py-2">Total</th>
                <th className="py-2">Ocupadas</th>
                <th className="py-2">Livres</th>
                <th className="py-2">% Ocupação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cidades.map((c) => {
                const livres = Number(c.portas_total) - Number(c.portas_ocupadas);
                return (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-1 pr-2 font-medium">{c.cidade}</td>
                    <td className="py-1 pr-2">
                      <CampoNum valor={Number(c.portas_total)} onSalvar={(v) => salvarCidade.mutate({ id: c.id, campo: "portas_total", valor: v })} />
                    </td>
                    <td className="py-1 pr-2">
                      <CampoNum valor={Number(c.portas_ocupadas)} onSalvar={(v) => salvarCidade.mutate({ id: c.id, campo: "portas_ocupadas", valor: v })} />
                    </td>
                    <td className="py-1 pr-2">{num(livres)}</td>
                    <td className="py-1 pr-2">
                      {pct(Number(c.portas_total) ? Number(c.portas_ocupadas) / Number(c.portas_total) : 0)}
                    </td>
                    <td className="py-1 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Remover ${c.cidade} e todos os seus dados de ${ano}?`))
                            excluirCidade.mutate(c.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {!cidades.length && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">
                  Nenhuma cidade cadastrada para {ano}. Use “Nova cidade”.
                </td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ImportarEstrategico ano={ano} onPronto={() => qc.invalidateQueries({ queryKey: ["estrategico", ano] })} />

    </div>
  );
}

function CampoNum({ valor, onSalvar }: { valor: number; onSalvar: (v: number) => void }) {
  const [txt, setTxt] = useState<string | null>(null);
  const mostrado = txt ?? String(valor ?? 0);
  return (
    <Input
      className="h-8 w-24 text-sm"
      inputMode="decimal"
      value={mostrado}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        if (txt === null) return;
        const v = Number(txt.replace(",", "."));
        setTxt(null);
        if (!Number.isNaN(v) && v !== valor) onSalvar(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function Kpi({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium uppercase text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Grafico({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactElement;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
        {descricao && <CardDescription>{descricao}</CardDescription>}
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
