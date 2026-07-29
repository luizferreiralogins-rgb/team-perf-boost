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
 * Faixa efetiva do consultor no mês (1 a 3). Faixa 1 é a base.
 * Sobe para faixa 2/3 conforme atinge, simultaneamente, a meta de receita
 * e a meta de % de renovações com móvel. Usa-se o MIN entre as duas dimensões.
 *
 * Tabela de metas (planilha Loja):
 *   Faixa 1: base (qualquer receita, qualquer % renov c/ móvel)
 *   Faixa 2: receita ≥ meta_receita(faixa 1) E % renov c/ móvel ≥ meta_renov(faixa 2)
 *   Faixa 3: receita ≥ meta_receita(faixa 2) E % renov c/ móvel ≥ meta_renov(faixa 3)
 */
export function faixaEfetivaLoja(
  metas: LojaMeta[],
  receitaMes: number,
  ratioRenovMovel: number,
): 1 | 2 | 3 {
  const m = [...(metas ?? [])].sort((a, b) => a.faixa - b.faixa);
  const f1 = m.find((x) => x.faixa === 1);
  const f2 = m.find((x) => x.faixa === 2);
  const f3 = m.find((x) => x.faixa === 3);
  if (!f1 || !f2) return 1;

  let lvlReceita: 1 | 2 | 3 = 1;
  if (receitaMes >= Number(f1.meta_receita)) lvlReceita = 2;
  if (receitaMes >= Number(f2.meta_receita)) lvlReceita = 3;

  let lvlRenov: 1 | 2 | 3 = 1;
  if (ratioRenovMovel >= Number(f2.meta_renov_movel)) lvlRenov = 2;
  if (f3 && ratioRenovMovel >= Number(f3.meta_renov_movel)) lvlRenov = 3;

  return Math.min(lvlReceita, lvlRenov) as 1 | 2 | 3;
}

/** Comissão Loja: R$ por protocolo. Só paga quando a diferença (novo - antigo) ≥ R$ 10.
 *  Para novas vendas (sem valor antigo) a diferença equivale ao próprio valor novo. */
export function comissaoLoja(
  faixas: LojaFaixaTicket[],
  valorNovo: number,
  valorAntigo: number | null | undefined,
  instalado: boolean,
): { diff: number; porFaixa: [number, number, number, number] } {
  const diff = Math.max(0, (valorNovo || 0) - (valorAntigo || 0));
  if (!instalado || !faixas.length || diff < TICKET_MINIMO) {
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
  if (!instalado || !faixas.length || !valor || valor < TICKET_MINIMO) {
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
