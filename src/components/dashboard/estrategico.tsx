// Aba "Estratégico" do dashboard de gestores: indicadores de portas, vendas,
// ativações, cancelamentos, churn, net ads e market share por cidade/mês.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
};

type Cidade = {
  id: string;
  cidade: string;
  ano: number;
  portas_total: number;
  portas_ocupadas: number;
  owner_id: string;
};

const CAMPOS: { key: keyof Mensal; label: string; pct?: boolean }[] = [
  { key: "vendas", label: "Vendas" },
  { key: "meta_vendas", label: "Meta de vendas" },
  { key: "quebra_venda", label: "Quebra de venda" },
  { key: "vendas_brutas", label: "Vendas brutas" },
  { key: "ativacoes", label: "Ativações" },
  { key: "meta_ativacoes", label: "Meta de ativações" },
  { key: "acessos_anatel", label: "Acessos Anatel" },
  { key: "cancel_voluntario", label: "Cancel. voluntário" },
  { key: "cancel_involuntario", label: "Cancel. involuntário" },
  { key: "market_share", label: "Market share (%)", pct: true },
];

const num = (n: number) => (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const pct = (n: number) => `${((n || 0) * 100).toFixed(1).replace(".", ",")}%`;
const anosDisponiveis = () => {
  const y = new Date().getFullYear();
  return [y + 1, y, y - 1, y - 2];
};

export function Estrategico() {
  const qc = useQueryClient();
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [novaCidade, setNovaCidade] = useState("");
  const [abrirNova, setAbrirNova] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["estrategico", ano],
    queryFn: async () => {
      const { data: cidades, error } = await supabase
        .from("estrategico_cidades")
        .select("id, cidade, ano, portas_total, portas_ocupadas, owner_id")
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
        mensais = (m ?? []) as Mensal[];
      }
      return { cidades: (cidades ?? []) as Cidade[], mensais };
    },
  });

  const cidades = data?.cidades ?? [];
  const mensais = data?.mensais ?? [];

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

  /** Consolidado por mês (todas as cidades visíveis). */
  const serie = useMemo(() => {
    return MESES.map((label, i) => {
      const m = i + 1;
      const rows = mensais.filter((x) => x.mes === m);
      const acc = rows.reduce(
        (s, r) => ({
          vendas: s.vendas + Number(r.vendas),
          meta_vendas: s.meta_vendas + Number(r.meta_vendas),
          quebra: s.quebra + Number(r.quebra_venda),
          brutas: s.brutas + Number(r.vendas_brutas),
          ativacoes: s.ativacoes + Number(r.ativacoes),
          meta_ativacoes: s.meta_ativacoes + Number(r.meta_ativacoes),
          anatel: s.anatel + Number(r.acessos_anatel),
          cvol: s.cvol + Number(r.cancel_voluntario),
          cinv: s.cinv + Number(r.cancel_involuntario),
          share: s.share + Number(r.market_share),
          nShare: s.nShare + (Number(r.market_share) > 0 ? 1 : 0),
        }),
        {
          vendas: 0, meta_vendas: 0, quebra: 0, brutas: 0, ativacoes: 0,
          meta_ativacoes: 0, anatel: 0, cvol: 0, cinv: 0, share: 0, nShare: 0,
        },
      );
      const cancelTotal = acc.cvol + acc.cinv;
      return {
        mes: label,
        ...acc,
        cancelTotal,
        pctVendas: acc.meta_vendas ? acc.vendas / acc.meta_vendas : 0,
        pctAtivacoes: acc.meta_ativacoes ? acc.ativacoes / acc.meta_ativacoes : 0,
        churnVol: acc.anatel ? acc.cvol / acc.anatel : 0,
        churnInv: acc.anatel ? acc.cinv / acc.anatel : 0,
        churnGeral: acc.anatel ? cancelTotal / acc.anatel : 0,
        liquidas: acc.ativacoes - cancelTotal,
        marketShare: acc.nShare ? acc.share / acc.nShare : 0,
      };
    }).map((r, i, arr) => ({
      ...r,
      netAds: i > 0 && arr[i - 1].anatel && r.anatel ? r.anatel - arr[i - 1].anatel : 0,
    }));
  }, [mensais]);

  const atual = serie[mes - 1];
  const portas = cidades.reduce(
    (s, c) => ({
      total: s.total + Number(c.portas_total),
      ocupadas: s.ocupadas + Number(c.portas_ocupadas),
    }),
    { total: 0, ocupadas: 0 },
  );
  const ocupacao = portas.total ? portas.ocupadas / portas.total : 0;

  const grafChurn = serie.map((s) => ({
    mes: s.mes,
    "Churn geral": Number((s.churnGeral * 100).toFixed(2)),
    "Voluntário": Number((s.churnVol * 100).toFixed(2)),
    "Involuntário": Number((s.churnInv * 100).toFixed(2)),
  }));

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Ano</Label>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anosDisponiveis().map((a) => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Mês de referência</Label>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Kpi title="Portas ocupadas" value={num(portas.ocupadas)} hint={`${num(portas.total)} portas · ${pct(ocupacao)} ocupação`} />
        <Kpi title={`Vendas (${MESES[mes - 1]})`} value={num(atual?.vendas ?? 0)} hint={`Meta ${num(atual?.meta_vendas ?? 0)} · ${pct(atual?.pctVendas ?? 0)}`} />
        <Kpi title="Quebra de vendas" value={num(atual?.quebra ?? 0)} hint={`Brutas ${num(atual?.brutas ?? 0)}`} />
        <Kpi title="Ativações" value={num(atual?.ativacoes ?? 0)} hint={`Meta ${num(atual?.meta_ativacoes ?? 0)} · ${pct(atual?.pctAtivacoes ?? 0)}`} />
        <Kpi title="Acessos Anatel" value={num(atual?.anatel ?? 0)} hint={`Net Ads ${num(atual?.netAds ?? 0)}`} />
        <Kpi title="Cancelamentos" value={num(atual?.cancelTotal ?? 0)} hint={`Vol. ${num(atual?.cvol ?? 0)} · Invol. ${num(atual?.cinv ?? 0)}`} />
        <Kpi title="Churn geral" value={pct(atual?.churnGeral ?? 0)} hint={`Vol. ${pct(atual?.churnVol ?? 0)} · Invol. ${pct(atual?.churnInv ?? 0)}`} />
        <Kpi title="Ativações líquidas" value={num(atual?.liquidas ?? 0)} hint="Ativações − cancelamentos" />
        <Kpi title="Net Ads" value={num(atual?.netAds ?? 0)} hint="Variação de acessos Anatel" />
        <Kpi title="Market share" value={pct(atual?.marketShare ?? 0)} hint="Média das cidades" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Grafico titulo="Vendas x Meta" descricao="Acompanhamento mensal">
          <LineChart data={serie}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="mes" fontSize={12} /><YAxis fontSize={12} />
            <Tooltip /><Legend />
            <Line type="monotone" dataKey="meta_vendas" name="Meta" stroke={ROXO} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="vendas" name="Vendas" stroke={AZUL} strokeWidth={2} dot={false} />
          </LineChart>
        </Grafico>

        <Grafico titulo="Ativações x Meta" descricao="Acompanhamento mensal">
          <LineChart data={serie}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="mes" fontSize={12} /><YAxis fontSize={12} />
            <Tooltip /><Legend />
            <Line type="monotone" dataKey="meta_ativacoes" name="Meta" stroke={ROXO} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="ativacoes" name="Ativações" stroke={AZUL} strokeWidth={2} dot={false} />
          </LineChart>
        </Grafico>

        <Grafico titulo="Churn (%)" descricao="Voluntário, involuntário e geral">
          <LineChart data={grafChurn}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="mes" fontSize={12} />
            <YAxis fontSize={12} unit="%" domain={[0, "auto"]} />
            <Tooltip /><Legend />
            <Line type="monotone" dataKey="Churn geral" stroke={AZUL} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Voluntário" stroke={ROXO} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Involuntário" stroke={AZUL_CLARO} strokeWidth={2} strokeDasharray="4 4" dot={false} />
          </LineChart>
        </Grafico>

        <Grafico titulo="Ativações líquidas e Net Ads" descricao="Crescimento da base">
          <LineChart data={serie}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="mes" fontSize={12} /><YAxis fontSize={12} />
            <Tooltip /><Legend />
            <Line type="monotone" dataKey="liquidas" name="Ativações líquidas" stroke={AZUL} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="netAds" name="Net Ads" stroke={ROXO} strokeWidth={2} dot={false} />
          </LineChart>
        </Grafico>

        <Grafico titulo="Acessos Anatel" descricao="Base total por mês">
          <LineChart data={serie}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="mes" fontSize={12} /><YAxis fontSize={12} domain={[0, "auto"]} />
            <Tooltip />
            <Line type="monotone" dataKey="anatel" name="Acessos" stroke={AZUL} strokeWidth={2} dot={false} />
          </LineChart>
        </Grafico>

        <Grafico titulo="Quebra de venda" descricao="Vendas brutas x quebra">
          <LineChart data={serie}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="mes" fontSize={12} /><YAxis fontSize={12} />
            <Tooltip /><Legend />
            <Line type="monotone" dataKey="brutas" name="Brutas" stroke={AZUL} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="quebra" name="Quebra" stroke={ROXO} strokeWidth={2} dot={false} />
          </LineChart>
        </Grafico>
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

      <Card>
        <CardHeader>
          <CardTitle>Relatório de {MESES[mes - 1]}/{ano}</CardTitle>
          <CardDescription>
            Preencha por cidade. Percentuais, churn, ativações líquidas e Net Ads são calculados automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-2">Cidade</th>
                {CAMPOS.map((c) => <th key={c.key} className="py-2 pr-2">{c.label}</th>)}
                <th className="py-2 pr-2">% Vendas</th>
                <th className="py-2 pr-2">% Ativações</th>
                <th className="py-2 pr-2">Churn geral</th>
                <th className="py-2 pr-2">Ativ. líquidas</th>
              </tr>
            </thead>
            <tbody>
              {cidades.map((c) => {
                const r = linha(c.id, mes);
                const v = (k: keyof Mensal) => Number(r?.[k] ?? 0);
                const cancel = v("cancel_voluntario") + v("cancel_involuntario");
                return (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-1 pr-2 font-medium whitespace-nowrap">{c.cidade}</td>
                    {CAMPOS.map((campo) => (
                      <td key={campo.key} className="py-1 pr-2">
                        <CampoNum
                          valor={campo.pct ? v(campo.key) * 100 : v(campo.key)}
                          onSalvar={(val) =>
                            salvarMensal.mutate({
                              cidade_id: c.id,
                              mes,
                              campo: campo.key as string,
                              valor: campo.pct ? val / 100 : val,
                            })
                          }
                        />
                      </td>
                    ))}
                    <td className="py-1 pr-2">{pct(v("meta_vendas") ? v("vendas") / v("meta_vendas") : 0)}</td>
                    <td className="py-1 pr-2">{pct(v("meta_ativacoes") ? v("ativacoes") / v("meta_ativacoes") : 0)}</td>
                    <td className="py-1 pr-2">{pct(v("acessos_anatel") ? cancel / v("acessos_anatel") : 0)}</td>
                    <td className="py-1 pr-2">{num(v("ativacoes") - cancel)}</td>
                  </tr>
                );
              })}
              {!cidades.length && (
                <tr><td colSpan={15} className="py-6 text-center text-muted-foreground">
                  Cadastre uma cidade para começar.
                </td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
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
