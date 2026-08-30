// Cálculos de comissão — espelham exatamente as planilhas oficiais
// "Gestão Lojas" (abas Correlacionamentos / Configuração - Tabelas e Metas)
// e "Gestão PAP" (aba Parametros — Tabelas 8.1 e 8.2 da Diretriz DC-MER-008).

export type LojaFaixaTicket = {
  diff_de: number;
  diff_ate: number;
  faixa_1: number;
  faixa_2: number;
  faixa_3: number;
};

export type LojaMeta = {
  faixa: number;
  meta_receita: number;
  meta_renov_movel: number;
};

export type LojaNovoProduto = {
  codigo: string;
  nome: string;
  percentual: number;
  limitado?: boolean;
  limite?: number;
};

export type PapFaixa = {
  faixa: number;
  receita_de: number;
  receita_ate: number;
  pct_comissao: number;
  meta_max_cancel?: number;
  acelerador_baixo_cancel: number;
  bonus_venda_indireta?: number;
};

export type PapNovoProduto = {
  codigo: string;
  nome: string;
  percentual: number;
  limitado: boolean;
  limite: number;
};

export function round2(v: number) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* ------------------------------------------------------------------ *
 *  LOJA
 * ------------------------------------------------------------------ */

/** Tecnologias com "Aplicação PP" (percentual sobre a diferença em novos acessos). */
const PREFIXOS_PP = ["01.04"];

/** Classes de protocolo tratadas como renovação quando não há mobilidade. */
const CLASSES_RENOVACAO = [
  "Renovação Contratual",
  "Renovação Contratual NxN",
  "Transferência de Endereço",
  "Migração de Tecnologia",
];

export type TipoComissaoLoja =
  | "Venda"
  | "Renovação com Mobilidade"
  | "Renovação sem Mobilidade"
  | "Novos Serviços";

function codigoTecnologia(tec: string) {
  return (tec ?? "").trim().slice(0, 5);
}

export function ehTecnologiaPP(tecnologia: string) {
  return PREFIXOS_PP.includes(codigoTecnologia(tecnologia));
}

export function produtoNovoServico(
  tecnologia: string,
  novos: LojaNovoProduto[],
): LojaNovoProduto | undefined {
  const cod = codigoTecnologia(tecnologia);
  return novos.find((p) => p.codigo.trim() === cod);
}

/** Correlacionamentos: classe de protocolo + contém móvel → tipo de comissão. */
export function tipoComissaoLoja(
  classe: string,
  contemMovel: boolean,
  tecnologia: string,
  novos: LojaNovoProduto[],
): TipoComissaoLoja {
  const novo = produtoNovoServico(tecnologia, novos);
  if (novo && (classe === "Novo Acesso" || classe === "Adicional de Serviço")) {
    return "Novos Serviços";
  }
  if (CLASSES_RENOVACAO.includes(classe)) {
    const comMovel =
      contemMovel &&
      (classe === "Renovação Contratual" || classe === "Renovação Contratual NxN");
    return comMovel ? "Renovação com Mobilidade" : "Renovação sem Mobilidade";
  }
  return "Venda";
}

/** Diferença de ticket = valor novo considerado − valor antigo. */
export function diferencaTicket(valorNovo: number, valorAntigo: number | null | undefined) {
  return round2((valorNovo || 0) - (valorAntigo || 0));
}

/**
 * Faixa efetiva do mês (1 a 3): menor valor entre a faixa de % de renovações
 * com móvel e a faixa de receita (soma das diferenças de ticket do mês).
 */
export function faixaEfetivaLoja(
  metas: LojaMeta[],
  receitaMes: number,
  ratioRenovMovel: number,
): 1 | 2 | 3 {
  const m = [...(metas ?? [])].sort((a, b) => a.faixa - b.faixa);
  if (!m.length) return 1;

  // Faixa % renovações: maior faixa cuja meta seja <= o atingimento.
  let lvlRenov = m[0].faixa;
  for (const x of m) if (ratioRenovMovel >= Number(x.meta_renov_movel)) lvlRenov = x.faixa;

  // Faixa receita: menor faixa cuja meta seja >= a receita acumulada.
  const alvo = m.find((x) => receitaMes <= Number(x.meta_receita));
  const lvlReceita = alvo ? alvo.faixa : m[m.length - 1].faixa;

  const f = Math.min(lvlRenov, lvlReceita);
  return Math.max(1, Math.min(3, f)) as 1 | 2 | 3;
}

function valorTabelaRenovacao(faixas: LojaFaixaTicket[], diff: number, faixa: number): number {
  if (!faixas.length) return 0;
  const ordenadas = [...faixas].sort((a, b) => Number(a.diff_de) - Number(b.diff_de));
  const row =
    ordenadas.find((f) => diff >= Number(f.diff_de) && diff < Number(f.diff_ate)) ??
    (diff >= Number(ordenadas[ordenadas.length - 1].diff_de)
      ? ordenadas[ordenadas.length - 1]
      : undefined);
  if (!row) return 0;
  const key = (["faixa_1", "faixa_1", "faixa_2", "faixa_3"] as const)[
    Math.max(0, Math.min(3, faixa))
  ];
  return Number(row[key]) || 0;
}

/**
 * DC-MER-020 (v002): os percentuais das tabelas 8.2 e 8.3 são fixos — a faixa
 * efetiva altera apenas os valores da tabela 8.1 (renovação contratual).
 */
export function fatorFaixaLoja(_faixas: LojaFaixaTicket[], _faixa: number): number {
  return 1;
}

export type CtxLoja = {
  classe: string;
  tecnologia: string;
  contemMovel: boolean;
  valorNovo: number;
  valorAntigo: number | null | undefined;
  instalado: boolean;
  faixas: LojaFaixaTicket[];
  novos: LojaNovoProduto[];
};

/** Comissão (R$) de uma venda Loja para uma determinada faixa efetiva. */
export function comissaoLojaNaFaixa(ctx: CtxLoja, faixa: number): number {
  if (!ctx.instalado) return 0;
  const tipo = tipoComissaoLoja(ctx.classe, ctx.contemMovel, ctx.tecnologia, ctx.novos);
  const diff = diferencaTicket(ctx.valorNovo, ctx.valorAntigo);

  // Tabela 8.3 — Novos produtos: percentual fixo sobre o valor da venda,
  // com limite de R$ 5.000,00 por venda quando previsto. Não soma com a 8.2.
  if (tipo === "Novos Serviços") {
    const p = produtoNovoServico(ctx.tecnologia, ctx.novos);
    const bruto = round2((ctx.valorNovo || 0) * (Number(p?.percentual) || 0));
    const limite = Number(p?.limite) || 0;
    return p?.limitado && limite > 0 ? Math.min(bruto, limite) : bruto;
  }

  // Tabela 8.1 — Renovação contratual: valor fixo pela diferença de ticket.
  if (tipo === "Renovação com Mobilidade" || tipo === "Renovação sem Mobilidade") {
    if (diff <= 0) return 0;
    return round2(valorTabelaRenovacao(ctx.faixas, diff, faixa));
  }

  // Tabela 8.2 — Adicional de Serviço: 10% fixo sobre o valor do plano.
  const base = ctx.valorNovo || 0;
  if (base <= 0) return 0;
  if (ctx.classe === "Adicional de Serviço") return round2(base * 0.1);

  // Tabela 8.2 — Novo Acesso: 5% para planos até R$ 99,90 quando Fibra (FTTH/FTTA);
  // demais casos (planos acima de R$ 99,90 ou outras tecnologias, ex.: Móvel): 10%.
  const ehFibra = codigoTecnologia(ctx.tecnologia) === "01.04";
  const pct = ehFibra && base <= 99.9 ? 0.05 : 0.1;
  return round2(base * pct);

}

/** Resultado completo: diferença, tipo e comissão em cada faixa efetiva (0 a 3). */
export function comissaoLoja(ctx: CtxLoja): {
  diff: number;
  tipo: TipoComissaoLoja;
  porFaixa: [number, number, number, number];
} {
  return {
    diff: diferencaTicket(ctx.valorNovo, ctx.valorAntigo),
    tipo: tipoComissaoLoja(ctx.classe, ctx.contemMovel, ctx.tecnologia, ctx.novos),
    porFaixa: [1, 1, 2, 3].map((f) => comissaoLojaNaFaixa(ctx, f)) as [
      number,
      number,
      number,
      number,
    ],
  };
}

/* ------------------------------------------------------------------ *
 *  PAP
 * ------------------------------------------------------------------ */

function normaliza(s: string) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function produtoPap(produto: string, produtos: PapNovoProduto[]) {
  const alvo = normaliza(produto);
  return produtos.find((p) => normaliza(p.nome) === alvo);
}

/** Faixa da Tabela 8.1 pela receita total instalada no mês (inclui produtos da 8.2). */
export function faixaPap(faixas: PapFaixa[], totalCoreMes: number): PapFaixa | undefined {
  if (!faixas.length) return undefined;
  const ord = [...faixas].sort((a, b) => Number(a.receita_de) - Number(b.receita_de));
  let row: PapFaixa | undefined;
  for (const f of ord) if (totalCoreMes >= Number(f.receita_de)) row = f;
  return row ?? ord[0];
}

export type CtxPap = {
  tipoProtocolo: string;
  produto: string;
  valor: number;
  instalado: boolean;
  /** Receita total já instalada no mês (8.1 + 8.2), incluindo esta venda. */
  totalCoreMes: number;
  faixas: PapFaixa[];
  produtos: PapNovoProduto[];
  /** Índice de cancelamento D+5 dentro da meta libera o acelerador. */
  dentroMetaCancelamento?: boolean;
};

/** Uma venda é "core" (Tabela 8.1) quando não é venda indireta nem produto da 8.2. */
export function ehCorePap(tipoProtocolo: string, produto: string, produtos: PapNovoProduto[]) {
  return tipoProtocolo !== "Venda Indireta" && !produtoPap(produto, produtos);
}

export function comissaoPap(ctx: CtxPap): {
  pct: number;
  valor: number;
  faixa: number;
  pctAcelerado: number;
  valorAcelerado: number;
  core: boolean;
} {
  const core = ehCorePap(ctx.tipoProtocolo, ctx.produto, ctx.produtos);
  const row = faixaPap(ctx.faixas, ctx.totalCoreMes);
  const vazio = { pct: 0, valor: 0, faixa: row?.faixa ?? 0, pctAcelerado: 0, valorAcelerado: 0, core };
  if (!ctx.instalado || !ctx.valor) return vazio;

  // Venda indireta: bônus da faixa sobre o valor da venda.
  if (ctx.tipoProtocolo === "Venda Indireta") {
    const pct = Number(row?.bonus_venda_indireta) || 0;
    const v = round2(ctx.valor * pct);
    return { pct, valor: v, faixa: row?.faixa ?? 0, pctAcelerado: pct, valorAcelerado: v, core };
  }

  // Tabela 8.2: percentual fixo do produto, limitado por venda. Não soma com a 8.1.
  const prod = produtoPap(ctx.produto, ctx.produtos);
  if (prod) {
    const pct = Number(prod.percentual) || 0;
    const bruto = ctx.valor * pct;
    const v = round2(prod.limitado ? Math.min(bruto, Number(prod.limite) || bruto) : bruto);
    return { pct, valor: v, faixa: 0, pctAcelerado: pct, valorAcelerado: v, core };
  }

  // Tabela 8.1: percentual da faixa + acelerador quando o cancelamento está na meta.
  const base = Number(row?.pct_comissao) || 0;
  const acel = Number(row?.acelerador_baixo_cancel) || 0;
  const pct = base + (ctx.dentroMetaCancelamento ? acel : 0);
  return {
    pct,
    valor: round2(ctx.valor * pct),
    faixa: row?.faixa ?? 0,
    pctAcelerado: base + acel,
    valorAcelerado: round2(ctx.valor * (base + acel)),
    core,
  };
}

/* ------------------------------------------------------------------ *
 *  Utilitários
 * ------------------------------------------------------------------ */

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
