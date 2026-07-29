// Cálculos de projeção de comissão + calculadora de parcela média.
// Baseado em parametros_loja_faixas_ticket e parametros_pap_faixas.

export type LojaFaixaTicket = {
  diff_de: number;
  diff_ate: number;
  faixa_0: number;
  faixa_1: number;
  faixa_2: number;
  faixa_3: number;
};

export type PapFaixa = {
  faixa: number;
  receita_de: number;
  receita_ate: number;
  pct_comissao: number;
  acelerador_baixo_cancel: number;
};

/** Comissão Loja: R$ por protocolo, cruzando diferença de ticket x faixa efetiva. */
export function comissaoLoja(
  faixas: LojaFaixaTicket[],
  valorNovo: number,
  valorAntigo: number | null | undefined,
  instalado: boolean,
): { diff: number; porFaixa: [number, number, number, number] } {
  const diff = Math.max(0, (valorNovo || 0) - (valorAntigo || 0));
  if (!instalado || !faixas.length) {
    return { diff, porFaixa: [0, 0, 0, 0] };
  }
  const row =
    faixas.find((f) => diff >= Number(f.diff_de) && diff < Number(f.diff_ate)) ??
    faixas[faixas.length - 1];
  return {
    diff,
    porFaixa: [
      Number(row.faixa_0) || 0,
      Number(row.faixa_1) || 0,
      Number(row.faixa_2) || 0,
      Number(row.faixa_3) || 0,
    ],
  };
}

/** Comissão PAP: % sobre valor de ativação. */
export function comissaoPap(
  faixas: PapFaixa[],
  valor: number,
  instalado: boolean,
): { pct: number; valor: number; pctAcelerado: number; valorAcelerado: number; faixa: number } {
  if (!instalado || !faixas.length || !valor) {
    return { pct: 0, valor: 0, pctAcelerado: 0, valorAcelerado: 0, faixa: 0 };
  }
  const row =
    faixas.find((f) => valor >= Number(f.receita_de) && valor <= Number(f.receita_ate)) ??
    faixas[faixas.length - 1];
  const pct = Number(row.pct_comissao) || 0;
  const acel = Number(row.acelerador_baixo_cancel) || 0;
  return {
    pct,
    valor: valor * pct,
    pctAcelerado: pct + acel,
    valorAcelerado: valor * (pct + acel),
    faixa: row.faixa,
  };
}

/** Parcela média: distribui o desconto ao longo do contrato. */
export function parcelaMedia(
  parcelaDesc: number,
  parcelaNormal: number,
  mesesComDesc: number,
  mesesTotal: number,
): number {
  if (!mesesTotal || mesesTotal <= 0) return 0;
  const md = Math.max(0, Math.min(mesesComDesc, mesesTotal));
  const mn = mesesTotal - md;
  return (parcelaDesc * md + parcelaNormal * mn) / mesesTotal;
}

export function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
