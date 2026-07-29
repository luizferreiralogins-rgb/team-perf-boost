// Cálculo de comissão — regras extraídas das planilhas Unifique.
// Regra global: comissão só é paga quando a venda está "instalado".

import { supabase } from "@/integrations/supabase/client";

export type VendaStatus = "pendente" | "instalado" | "cancelado" | "em_analise";

export async function calcularComissaoLoja(input: {
  valor_novo: number;
  valor_antigo: number | null;
  status: VendaStatus;
  tecnologia?: string | null;
  faixa_efetiva?: 0 | 1 | 2 | 3;
}): Promise<number> {
  if (input.status !== "instalado") return 0;
  const diff = Math.max(0, (input.valor_novo ?? 0) - (input.valor_antigo ?? 0));
  const { data: faixas } = await supabase
    .from("parametros_loja_faixas_ticket")
    .select("*")
    .order("diff_de", { ascending: true });
  if (!faixas) return 0;
  const linha = faixas.find((f) => diff >= Number(f.diff_de) && diff < Number(f.diff_ate));
  if (!linha) return 0;
  const faixa = input.faixa_efetiva ?? 1;
  const key = `faixa_${faixa}` as "faixa_0" | "faixa_1" | "faixa_2" | "faixa_3";
  return Number(linha[key] ?? 0);
}

export async function calcularComissaoPap(input: {
  receita_total: number;
  status: VendaStatus;
  valor_venda: number;
}): Promise<number> {
  if (input.status !== "instalado") return 0;
  const { data: faixas } = await supabase
    .from("parametros_pap_faixas")
    .select("*")
    .order("faixa", { ascending: true });
  if (!faixas) return 0;
  const linha = faixas.find(
    (f) => input.receita_total >= Number(f.receita_de) && input.receita_total <= Number(f.receita_ate),
  );
  if (!linha) return input.valor_venda * 0.05;
  return input.valor_venda * Number(linha.pct_comissao);
}
