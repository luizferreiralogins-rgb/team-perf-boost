import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  brl,
  comissaoLoja,
  comissaoPap,
  parcelaMedia,
  type LojaFaixaTicket,
  type LojaNovoProduto,
  type PapFaixa,
  type PapNovoProduto,
} from "@/lib/comissao";

export function useParametrosLoja() {
  return useQuery({
    queryKey: ["parametros-loja-faixas"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [{ data: faixas }, { data: novos }] = await Promise.all([
        supabase
          .from("parametros_loja_faixas_ticket")
          .select("diff_de,diff_ate,faixa_1,faixa_2,faixa_3")
          .order("diff_de"),
        supabase.from("parametros_loja_novos_produtos").select("codigo,nome,percentual,limitado,limite"),
      ]);
      return {
        faixas: (faixas ?? []) as LojaFaixaTicket[],
        novos: (novos ?? []) as LojaNovoProduto[],
      };
    },
  });
}

export function useParametrosPap() {
  return useQuery({
    queryKey: ["parametros-pap-faixas"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [{ data: faixas }, { data: produtos }] = await Promise.all([
        supabase
          .from("parametros_pap_faixas")
          .select(
            "faixa,receita_de,receita_ate,pct_comissao,meta_max_cancel,acelerador_baixo_cancel,bonus_venda_indireta",
          )
          .order("receita_de"),
        supabase
          .from("parametros_pap_novos_produtos")
          .select("codigo,nome,percentual,limitado,limite"),
      ]);
      return {
        faixas: (faixas ?? []) as PapFaixa[],
        produtos: (produtos ?? []) as PapNovoProduto[],
      };
    },
  });
}

export function ProjecaoComissaoLoja({
  valorNovo,
  valorAntigo,
  instalado,
  classe,
  tecnologia,
  contemMovel,
}: {
  valorNovo: string;
  valorAntigo: string;
  instalado: boolean;
  classe: string;
  tecnologia: string;
  contemMovel: boolean;
}) {
  const q = useParametrosLoja();
  const { diff, tipo, porFaixa } = useMemo(
    () =>
      comissaoLoja({
        classe,
        tecnologia,
        contemMovel,
        valorNovo: parseFloat(valorNovo) || 0,
        valorAntigo: parseFloat(valorAntigo) || 0,
        instalado,
        faixas: q.data?.faixas ?? [],
        novos: q.data?.novos ?? [],
      }),
    [q.data, valorNovo, valorAntigo, instalado, classe, tecnologia, contemMovel],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Projeção de comissão</CardTitle>
        <CardDescription>
          Diferença de ticket: <span className="font-medium text-foreground">{brl(diff)}</span>
          <br />
          Tipo de comissão: <span className="font-medium text-foreground">{tipo}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!instalado && (
          <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
            Marque <span className="font-medium">Instalado = Sim</span> para contabilizar comissão.
          </p>
        )}
        <div className="space-y-1.5 text-sm">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-md border px-3 py-1.5"
            >
              <span className="text-muted-foreground">Faixa efetiva {i}</span>
              <span className="font-semibold">{brl(porFaixa[i])}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          A faixa efetiva do mês é o menor valor entre a faixa de % de renovações com móvel e a
          faixa de receita (soma das diferenças de ticket). Novos acessos de banda larga pagam 5%
          (até R$ 99,90) ou 10% da diferença, independentemente da faixa.
        </p>
      </CardContent>
    </Card>
  );
}

export function ProjecaoComissaoPap({
  valor,
  instalado,
  tipoProtocolo,
  produto,
  mesRef,
  vendedorId,
  editingId,
}: {
  valor: string;
  instalado: boolean;
  tipoProtocolo: string;
  produto: string;
  mesRef: string;
  vendedorId?: string;
  editingId?: string;
}) {
  const q = useParametrosPap();

  const acumuladoQ = useQuery({
    queryKey: ["pap-core-mes", mesRef, vendedorId],
    enabled: !!mesRef,
    queryFn: async () => {
      const uid = vendedorId ?? (await supabase.auth.getUser()).data.user?.id;
      if (!uid) return [] as { id: string; valor: number; produto: string | null; tipo_protocolo: string | null }[];
      const { data } = await supabase
        .from("vendas_pap")
        .select("id, valor, produto, tipo_protocolo")
        .eq("vendedor_id", uid)
        .eq("mes_ref", mesRef)
        .eq("status", "instalado");
      return (data ?? []) as {
        id: string;
        valor: number;
        produto: string | null;
        tipo_protocolo: string | null;
      }[];
    },
  });

  const calc = useMemo(() => {
    const v = parseFloat(valor) || 0;
    const produtos = q.data?.produtos ?? [];
    const outras = (acumuladoQ.data ?? []).filter((r) => r.id !== editingId);
    const coreOutras = outras.reduce((s, r) => s + Number(r.valor ?? 0), 0);
    return comissaoPap({
      tipoProtocolo,
      produto,
      valor: v,
      instalado,
      totalCoreMes: coreOutras + (instalado ? v : 0),
      faixas: q.data?.faixas ?? [],
      produtos,
    });
  }, [q.data, acumuladoQ.data, valor, instalado, tipoProtocolo, produto, editingId]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Projeção de comissão</CardTitle>
        <CardDescription>
          {calc.core
            ? "Tabela 8.1 — percentual conforme a receita acumulada do mês."
            : "Tabela 8.2 / venda indireta — percentual fixo sobre o valor da venda."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {!instalado && (
          <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
            Comissão só é contabilizada quando <span className="font-medium">instalado</span>.
          </p>
        )}
        {calc.core && (
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <span className="text-muted-foreground">Faixa (8.1)</span>
            <span className="font-semibold">{calc.faixa || "-"}</span>
          </div>
        )}
        <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-muted-foreground">
            Comissão ({(calc.pct * 100).toFixed(1)}%)
          </span>
          <span className="font-semibold text-primary">{brl(calc.valor)}</span>
        </div>
        {calc.core && (
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <span className="text-muted-foreground">
              Com acelerador ({(calc.pctAcelerado * 100).toFixed(1)}%)
            </span>
            <span className="font-semibold">{brl(calc.valorAcelerado)}</span>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          O acelerador é pago apenas quando o índice de cancelamento D+5 fica dentro da meta.
        </p>
      </CardContent>
    </Card>
  );
}

export function CalculadoraParcelaMedia({
  defaultParcelaNormal,
  defaultParcelaDesc,
}: {
  defaultParcelaNormal?: string;
  defaultParcelaDesc?: string;
}) {
  const [meses, setMeses] = useState("6");
  const [mesesTotal, setMesesTotal] = useState("12");
  const [pDesc, setPDesc] = useState(defaultParcelaDesc ?? "");
  const [pNormal, setPNormal] = useState(defaultParcelaNormal ?? "");

  const media = useMemo(
    () =>
      parcelaMedia(
        parseFloat(pDesc) || 0,
        parseFloat(pNormal) || 0,
        parseInt(meses) || 0,
        parseInt(mesesTotal) || 0,
      ),
    [pDesc, pNormal, meses, mesesTotal],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4" /> Calculadora de parcela média
        </CardTitle>
        <CardDescription>Distribui o desconto pelo prazo total do contrato.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Meses c/ desc.</Label>
            <Input
              type="number"
              min="0"
              value={meses}
              onChange={(e) => setMeses(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Contrato (meses)</Label>
            <Input
              type="number"
              min="1"
              value={mesesTotal}
              onChange={(e) => setMesesTotal(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Parcela Desc. (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={pDesc}
              onChange={(e) => setPDesc(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Parcela Normal (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={pNormal}
              onChange={(e) => setPNormal(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-md bg-destructive px-3 py-2 text-destructive-foreground">
          <span className="text-sm font-medium">Parcela média</span>
          <span className="text-lg font-bold">{brl(media)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
