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
  type PapFaixa,
} from "@/lib/comissao";

function useFaixasLoja() {
  return useQuery({
    queryKey: ["parametros-loja-faixas"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parametros_loja_faixas_ticket")
        .select("diff_de,diff_ate,faixa_0,faixa_1,faixa_2,faixa_3")
        .order("diff_de");
      if (error) throw error;
      return (data ?? []) as LojaFaixaTicket[];
    },
  });
}

function useFaixasPap() {
  return useQuery({
    queryKey: ["parametros-pap-faixas"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parametros_pap_faixas")
        .select("faixa,receita_de,receita_ate,pct_comissao,acelerador_baixo_cancel")
        .order("receita_de");
      if (error) throw error;
      return (data ?? []) as PapFaixa[];
    },
  });
}

export function ProjecaoComissaoLoja({
  valorNovo,
  valorAntigo,
  instalado,
}: {
  valorNovo: string;
  valorAntigo: string;
  instalado: boolean;
}) {
  const q = useFaixasLoja();
  const { diff, porFaixa } = useMemo(() => {
    const vn = parseFloat(valorNovo) || 0;
    const va = parseFloat(valorAntigo) || 0;
    return comissaoLoja(q.data ?? [], vn, va, instalado);
  }, [q.data, valorNovo, valorAntigo, instalado]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Projeção de comissão</CardTitle>
        <CardDescription>
          Diferença de ticket: <span className="font-medium text-foreground">{brl(diff)}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!instalado && (
          <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
            Marque <span className="font-medium">Instalado = Sim</span> para contabilizar comissão.
          </p>
        )}
        <div className="space-y-1.5 text-sm">
          {(["faixa_0", "faixa_1", "faixa_2", "faixa_3"] as const).map((k, i) => (
            <div
              key={k}
              className="flex items-center justify-between rounded-md border px-3 py-1.5"
            >
              <span className="text-muted-foreground">Faixa efetiva {i}</span>
              <span className="font-semibold">{brl(porFaixa[i])}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          A faixa efetiva é definida pelo % de atingimento da meta mensal da equipe.
        </p>
      </CardContent>
    </Card>
  );
}

export function ProjecaoComissaoPap({
  valor,
  instalado,
}: {
  valor: string;
  instalado: boolean;
}) {
  const q = useFaixasPap();
  const calc = useMemo(() => {
    const v = parseFloat(valor) || 0;
    return comissaoPap(q.data ?? [], v, instalado);
  }, [q.data, valor, instalado]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Projeção de comissão</CardTitle>
        <CardDescription>Baseado no valor de ativação informado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {!instalado && (
          <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
            Comissão só é contabilizada quando <span className="font-medium">instalado</span>.
          </p>
        )}
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <span className="text-muted-foreground">Faixa</span>
          <span className="font-semibold">{calc.faixa || "-"}</span>
        </div>
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <span className="text-muted-foreground">
            % comissão ({(calc.pct * 100).toFixed(1)}%)
          </span>
          <span className="font-semibold">{brl(calc.valor)}</span>
        </div>
        <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-muted-foreground">
            Com acelerador ({(calc.pctAcelerado * 100).toFixed(1)}%)
          </span>
          <span className="font-semibold text-primary">{brl(calc.valorAcelerado)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Acelerador aplicado quando o índice de cancelamento da equipe fica abaixo da meta.
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
