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

export type LojaMeta = {
  faixa: number;
  meta_receita: number;
  meta_renov_movel: number;
};

/** Ticket mínimo para elegibilidade de comissão (vendas, renovações e demais serviços). */
export const TICKET_MINIMO = 10;

/**
 * Faixa efetiva do consultor no mês.
 * Regra atual: única condicionante é o ticket > R$ 10 (validado em comissaoLoja).
 * Metas de receita/renov. móvel não gatam mais a comissão — mantém-se a faixa máxima.
 */
export function faixaEfetivaLoja(
  _metas: LojaMeta[],
  _receitaMes: number,
  _ratioRenovMovel: number,
): 0 | 1 | 2 | 3 {
  return 3;
}

/** Comissão Loja: R$ por protocolo. Só paga quando o ticket (novo) > R$ 10. */
export function comissaoLoja(
  faixas: LojaFaixaTicket[],
  valorNovo: number,
  valorAntigo: number | null | undefined,
  instalado: boolean,
): { diff: number; porFaixa: [number, number, number, number] } {
  const diff = Math.max(0, (valorNovo || 0) - (valorAntigo || 0));
  const ticket = valorNovo || 0;
  if (!instalado || !faixas.length || ticket <= TICKET_MINIMO) {
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

/** Comissão PAP: % sobre valor de ativação. Só paga quando o ticket > R$ 10. */
export function comissaoPap(
  faixas: PapFaixa[],
  valor: number,
  instalado: boolean,
): { pct: number; valor: number; pctAcelerado: number; valorAcelerado: number; faixa: number } {
  if (!instalado || !faixas.length || !valor || valor <= TICKET_MINIMO) {
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
