import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isBlPap } from "@/lib/kpi-qtd";

/** DC-MER-005 v006 — Diretriz Líder de Vendas PAP. */
export const LIDER_VALOR_FIXO = 9000;
export const LIDER_PCT_POR_COLABORADOR = 0.125;
export const LIDER_MAX_COLABORADORES = 8;
/** Tabela 8.3: [de (exclusivo acima de), %]. */
export const LIDER_FAIXAS: { faixa: number; acimaDe: number; pct: number }[] = [
  { faixa: 1, acimaDe: -Infinity, pct: 0 },
  { faixa: 2, acimaDe: 2000, pct: 0.03 },
  { faixa: 3, acimaDe: 2250, pct: 0.04 },
  { faixa: 4, acimaDe: 2500, pct: 0.05 },
  { faixa: 5, acimaDe: 2750, pct: 0.06 },
  { faixa: 6, acimaDe: 3000, pct: 0.07 },
  { faixa: 7, acimaDe: 3250, pct: 0.08 },
  { faixa: 8, acimaDe: 3500, pct: 0.09 },
  { faixa: 9, acimaDe: 3750, pct: 0.125 },
];

export function faixaLider(atingimento: number) {
  let f = LIDER_FAIXAS[0]!;
  for (const x of LIDER_FAIXAS) if (atingimento > x.acimaDe) f = x;
  const prox = LIDER_FAIXAS.find((x) => x.faixa === f.faixa + 1);
  return { ...f, proxima: prox ? { faixa: prox.faixa, falta: Math.max(0.01, prox.acimaDe + 0.01 - atingimento), pct: prox.pct } : null };
}

export type ColabLider = { id: string; nome: string; atingimento: number };

export function calcularComissaoLider(colabs: ColabLider[]) {
  const n = Math.min(colabs.length, LIDER_MAX_COLABORADORES);
  const tetoPct = n * LIDER_PCT_POR_COLABORADOR;
  const detalhes = colabs.map((c) => ({ ...c, ...faixaLider(c.atingimento) }));
  const somaPct = detalhes.reduce((s, d) => s + d.pct, 0);
  const pctAplicado = Math.min(somaPct, tetoPct);
  return { comissao: Math.round(pctAplicado * LIDER_VALOR_FIXO * 100) / 100, somaPct, tetoPct, detalhes };
}

type VendaPap = { vendedor_id: string; produto?: string | null; tecnologia?: string | null; tipo_protocolo?: string | null; valor?: number | null; valor_novo?: number | null; status?: string | null };

/** Atingimento = receita dos Novos Acessos de Banda Larga/combo instalados. */
export function atingimentoPorVendedor(vendas: VendaPap[]) {
  const m = new Map<string, number>();
  for (const v of vendas) {
    if (v.status !== "instalado" || !isBlPap(v)) continue;
    const val = Number(v.valor_novo ?? 0) || Number(v.valor ?? 0);
    m.set(v.vendedor_id, (m.get(v.vendedor_id) ?? 0) + val);
  }
  return m;
}

export function useComissaoLider(liderId: string | undefined, mesRef: string) {
  return useQuery({
    queryKey: ["comissao-lider", liderId, mesRef],
    enabled: !!liderId,
    queryFn: async () => {
      const { data: equipe, error } = await supabase
        .from("profiles").select("id, nome").eq("gerente_id", liderId!).eq("ativo", true);
      if (error) throw error;
      const ids = (equipe ?? []).map((p) => p.id);
      let vendas: VendaPap[] = [];
      if (ids.length) {
        const r = await supabase
          .from("vendas_pap")
          .select("vendedor_id, produto, tecnologia, tipo_protocolo, valor, valor_novo, status")
          .in("vendedor_id", ids).eq("mes_ref", mesRef);
        if (r.error) throw r.error;
        vendas = r.data ?? [];
      }
      const at = atingimentoPorVendedor(vendas);
      return calcularComissaoLider((equipe ?? []).map((p) => ({ id: p.id, nome: p.nome, atingimento: at.get(p.id) ?? 0 })));
    },
  });
}
