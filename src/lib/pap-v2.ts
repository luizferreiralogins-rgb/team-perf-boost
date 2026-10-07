// Comissionamento PAP a partir de 10/2026 — DC-MER-008 v009 + PV-MER-008 v001.
// Meses anteriores continuam usando as regras antigas (parametros_pap_faixas).
import { supabase } from "@/integrations/supabase/client";
import { isBlPap } from "@/lib/kpi-qtd";
import { round2 } from "@/lib/comissao";

export const PAP_V2_INICIO = "2026-10-01";
export const usaPapV2 = (mesRef?: string | null) => (mesRef ?? "").slice(0, 10) >= PAP_V2_INICIO;

export type FaixaBl = { faixa: number; ativ_de: number; ativ_ate: number; pct_comissao: number; bonus_venda_indireta: number };
export type FaixaDemais = { faixa: number; receita_de: number; receita_ate: number; pct_comissao: number; bonus_venda_indireta: number };
export type ProdutoV2 = { codigo: string; nome: string; percentual: number; limitado: boolean; limite: number };
export type AcelChurn = { faixa: number; churn_de: number; churn_ate: number; bonus: number };
export type AcelRazao = { faixa: number; razao_de: number; razao_ate: number; bonus: number };

export type ParamsPapV2 = {
  faixasBl: FaixaBl[];
  faixasDemais: FaixaDemais[];
  produtos: ProdutoV2[];
  acelChurn: AcelChurn[];
  acelRazao: AcelRazao[];
  minBlRazao: number;
  teto: number;
};

export async function carregarParamsPapV2(): Promise<ParamsPapV2> {
  const [bl, dm, pr, ch, rz, ger] = await Promise.all([
    supabase.from("parametros_pap2_faixas_bl").select("faixa,ativ_de,ativ_ate,pct_comissao,bonus_venda_indireta").order("ativ_de"),
    supabase.from("parametros_pap2_faixas_demais").select("faixa,receita_de,receita_ate,pct_comissao,bonus_venda_indireta").order("receita_de"),
    supabase.from("parametros_pap2_novos_produtos").select("codigo,nome,percentual,limitado,limite"),
    supabase.from("parametros_pap2_acel_churn").select("faixa,churn_de,churn_ate,bonus").order("churn_de"),
    supabase.from("parametros_pap2_acel_razao").select("faixa,razao_de,razao_ate,bonus").order("razao_de"),
    supabase.from("parametros_gerais").select("chave,valor_num"),
  ]);
  const num = (k: string, d: number) => {
    const v = (ger.data ?? []).find((g) => g.chave === k)?.valor_num;
    return v === null || v === undefined ? d : Number(v);
  };
  return {
    faixasBl: (bl.data ?? []) as FaixaBl[],
    faixasDemais: (dm.data ?? []) as FaixaDemais[],
    produtos: (pr.data ?? []) as ProdutoV2[],
    acelChurn: (ch.data ?? []) as AcelChurn[],
    acelRazao: (rz.data ?? []) as AcelRazao[],
    minBlRazao: num("pap_razao_min_bl", 22),
    teto: num("pap_teto_comissao", 0.5),
  };
}

const norm = (s: string) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

export type GrupoPap = "bl_movel" | "demais" | "novo";

export function produtoV2(produto: string, produtos: ProdutoV2[]) {
  const a = norm(produto);
  return produtos.find((p) => norm(p.nome) === a);
}

export function ehMovelPos(produto: string) {
  const p = norm(produto);
  return p.includes("movel") && !p.includes("pre-pago") && !p.includes("pre pago");
}

export function grupoPapV2(produto: string, produtos: ProdutoV2[]): GrupoPap {
  if (produtoV2(produto, produtos)) return "novo";
  const p = norm(produto);
  if (p.includes("banda larga") || ehMovelPos(produto)) return "bl_movel";
  return "demais";
}

export type VendaPapV2 = {
  produto?: string | null;
  tecnologia?: string | null;
  tipo_protocolo?: string | null;
  qtd_linhas?: number | null;
  valor?: number | null;
  status?: string | null;
};

export type ResumoPapV2 = { blQtd: number; linhasMovel: number; receitaDemais: number; indiceCancel: number | null };

/** Resumo do mês (apenas vendas instaladas). */
export function resumoMesPapV2(rows: VendaPapV2[], produtos: ProdutoV2[], indiceCancel: number | null): ResumoPapV2 {
  let blQtd = 0, linhasMovel = 0, receitaDemais = 0;
  for (const v of rows) {
    if (v.status && v.status !== "instalado") continue;
    if (isBlPap(v)) blQtd += 1;
    if (ehMovelPos(v.produto ?? "")) linhasMovel += Math.max(1, Number(v.qtd_linhas ?? 0) || 0);
    if (v.tipo_protocolo !== "Venda Indireta" && grupoPapV2(v.produto ?? "", produtos) === "demais")
      receitaDemais += Number(v.valor ?? 0);
  }
  return { blQtd, linhasMovel, receitaDemais, indiceCancel };
}

export function faixaBlDe(p: ParamsPapV2, blQtd: number) {
  const ord = [...p.faixasBl].sort((a, b) => a.ativ_de - b.ativ_de);
  let row = ord[0];
  for (const f of ord) if (blQtd >= Number(f.ativ_de)) row = f;
  return row;
}

export function faixaDemaisDe(p: ParamsPapV2, receita: number) {
  const ord = [...p.faixasDemais].sort((a, b) => a.receita_de - b.receita_de);
  let row = ord[0];
  for (const f of ord) if (receita >= Number(f.receita_de)) row = f;
  return row;
}

export function bonusChurn(p: ParamsPapV2, indice: number | null) {
  if (indice === null) return 0;
  const row = p.acelChurn.find((c) => indice >= Number(c.churn_de) && indice <= Number(c.churn_ate));
  return Number(row?.bonus ?? 0);
}

export function razaoMovelBl(r: ResumoPapV2) {
  return r.blQtd > 0 ? r.linhasMovel / r.blQtd : 0;
}

export function bonusRazao(p: ParamsPapV2, r: ResumoPapV2) {
  if (r.blQtd < p.minBlRazao) return 0;
  const razao = Math.floor(razaoMovelBl(r) * 100) / 100;
  let b = 0;
  for (const x of [...p.acelRazao].sort((a, c) => a.razao_de - c.razao_de))
    if (razao >= Number(x.razao_de)) b = Number(x.bonus);
  return b;
}

export type ResultadoPapV2 = {
  grupo: GrupoPap | "indireta";
  faixa: number;
  pctBase: number;
  bonusChurn: number;
  bonusRazao: number;
  pct: number;
  valor: number;
};

export function comissaoPapV2(
  v: { produto: string; tipoProtocolo: string; valor: number; instalado: boolean },
  r: ResumoPapV2,
  p: ParamsPapV2,
): ResultadoPapV2 {
  const grupo = grupoPapV2(v.produto, p.produtos);
  const zero = { faixa: 0, pctBase: 0, bonusChurn: 0, bonusRazao: 0, pct: 0, valor: 0 };

  // Venda indireta: bônus da faixa (8.1 para BL/Móvel, 8.2 demais), sem aceleradores.
  if (v.tipoProtocolo === "Venda Indireta") {
    const row = grupo === "bl_movel" ? faixaBlDe(p, r.blQtd) : faixaDemaisDe(p, r.receitaDemais);
    const pct = Number(row?.bonus_venda_indireta ?? 0);
    const base = { grupo: "indireta" as const, faixa: Number(row?.faixa ?? 0), pctBase: pct, bonusChurn: 0, bonusRazao: 0, pct };
    return { ...base, valor: v.instalado ? round2(v.valor * pct) : 0 };
  }

  // Tabela 8.3: percentual fixo, sem aceleradores, limite por venda.
  if (grupo === "novo") {
    const prod = produtoV2(v.produto, p.produtos)!;
    const pct = Number(prod.percentual) || 0;
    const bruto = v.valor * pct;
    const valor = prod.limitado ? Math.min(bruto, Number(prod.limite) || bruto) : bruto;
    return { grupo, ...zero, pctBase: pct, pct, valor: v.instalado ? round2(valor) : 0 };
  }

  const bc = bonusChurn(p, r.indiceCancel);
  if (grupo === "bl_movel") {
    const row = faixaBlDe(p, r.blQtd);
    const base = Number(row?.pct_comissao ?? 0);
    const br = bonusRazao(p, r);
    const pct = Math.min(p.teto, base + bc + br);
    return { grupo, faixa: Number(row?.faixa ?? 0), pctBase: base, bonusChurn: bc, bonusRazao: br, pct, valor: v.instalado ? round2(v.valor * pct) : 0 };
  }

  const row = faixaDemaisDe(p, r.receitaDemais);
  const base = Number(row?.pct_comissao ?? 0);
  const pct = Math.min(p.teto, base + bc);
  return { grupo, faixa: Number(row?.faixa ?? 0), pctBase: base, bonusChurn: bc, bonusRazao: 0, pct, valor: v.instalado ? round2(v.valor * pct) : 0 };
}

/** Índice de cancelamento: informado manualmente ou (opcional) estimado pelo mês. */
export function indiceCancelPap(
  manual: number | null | undefined,
  rows: { status?: string | null }[],
  estimar: boolean,
): number | null {
  if (manual !== null && manual !== undefined) return Number(manual);
  if (!estimar) return null;
  const c = rows.filter((v) => v.status === "cancelado").length;
  const i = rows.filter((v) => v.status === "instalado").length;
  return c + i > 0 ? c / (c + i) : null;
}
