// Recalcula as comissões de um vendedor em um mês, aplicando as regras vigentes.
// Necessário porque tanto Loja (faixa efetiva) quanto PAP (faixa por receita
// acumulada) dependem do conjunto de vendas do mês, não apenas da venda editada.

import { supabase } from "@/integrations/supabase/client";
import {
  comissaoLojaNaFaixa,
  comissaoPap,
  diferencaTicket,
  ehCorePap,
  faixaEfetivaLoja,
  faixaPap,
  tipoComissaoLoja,
  type LojaFaixaTicket,
  type LojaMeta,
  type LojaNovoProduto,
  type PapFaixa,
  type PapNovoProduto,
} from "@/lib/comissao";

export async function recalcularLojaMes(vendedorId: string, mesRef: string) {
  const [{ data: faixas }, { data: metas }, { data: novos }, { data: vendas }] = await Promise.all([
    supabase
      .from("parametros_loja_faixas_ticket")
      .select("diff_de, diff_ate, faixa_1, faixa_2, faixa_3"),
    supabase.from("parametros_loja_metas").select("faixa, meta_receita, meta_renov_movel"),
    supabase.from("parametros_loja_novos_produtos").select("codigo, nome, percentual, limitado, limite"),
    supabase
      .from("vendas_loja")
      .select("id, valor_novo, valor_antigo, classe_protocolo, contem_movel, tecnologia, status")
      .eq("vendedor_id", vendedorId)
      .eq("mes_ref", mesRef),
  ]);

  const listaFaixas = (faixas ?? []) as LojaFaixaTicket[];
  const listaNovos = (novos ?? []) as LojaNovoProduto[];
  const rows = vendas ?? [];
  if (!rows.length) return;
  // Sem os parâmetros vigentes o cálculo zeraria comissões válidas — aborta.
  if (!listaFaixas.length || !(metas ?? []).length) return;


  const receitaMes = rows.reduce(
    (s, v) => s + diferencaTicket(Number(v.valor_novo), v.valor_antigo),
    0,
  );
  const tipos = rows.map((v) =>
    tipoComissaoLoja(v.classe_protocolo ?? "", !!v.contem_movel, v.tecnologia ?? "", listaNovos),
  );
  const totalRenov = tipos.filter((t) => t.startsWith("Renovação")).length;
  const renovMovel = tipos.filter((t) => t === "Renovação com Mobilidade").length;
  const faixaEfet = faixaEfetivaLoja(
    (metas ?? []) as LojaMeta[],
    receitaMes,
    totalRenov > 0 ? renovMovel / totalRenov : 0,
  );

  await Promise.all(
    rows.map((v, i) => {
      const comissao = comissaoLojaNaFaixa(
        {
          classe: v.classe_protocolo ?? "",
          tecnologia: v.tecnologia ?? "",
          contemMovel: !!v.contem_movel,
          valorNovo: Number(v.valor_novo),
          valorAntigo: v.valor_antigo,
          instalado: v.status === "instalado",
          faixas: listaFaixas,
          novos: listaNovos,
        },
        faixaEfet,
      );
      return supabase
        .from("vendas_loja")
        .update({ comissao, tipo_comissao: tipos[i] })
        .eq("id", v.id);
    }),
  );
}

export async function recalcularPapMes(vendedorId: string, mesRef: string) {
  const [{ data: faixas }, { data: produtos }, { data: vendas }, { data: cond }, { data: gerais }] =
    await Promise.all([
      supabase
        .from("parametros_pap_faixas")
        .select(
          "faixa, receita_de, receita_ate, pct_comissao, meta_max_cancel, acelerador_baixo_cancel, bonus_venda_indireta",
        ),
      supabase
        .from("parametros_pap_novos_produtos")
        .select("codigo, nome, percentual, limitado, limite"),
      supabase
        .from("vendas_pap")
        .select("id, valor, produto, tipo_protocolo, status")
        .eq("vendedor_id", vendedorId)
        .eq("mes_ref", mesRef),
      supabase
        .from("comissao_condicionantes")
        .select("indice_cancelamento")
        .eq("vendedor_id", vendedorId)
        .eq("mes_ref", mesRef)
        .maybeSingle(),
      supabase.from("parametros_gerais").select("chave, valor_bool"),
    ]);

  const listaFaixas = (faixas ?? []) as PapFaixa[];
  const listaProdutos = (produtos ?? []) as PapNovoProduto[];
  const rows = vendas ?? [];
  if (!rows.length) return;
  if (!listaFaixas.length) return;


  const flag = (chave: string, padrao: boolean) =>
    (gerais ?? []).find((g) => g.chave === chave)?.valor_bool ?? padrao;
  const incluiNovosNaFaixa = flag("pap_faixa_inclui_novos_produtos", true);
  const estimarCancel = flag("pap_acelerador_automatico", true);

  // Faixa da Tabela 8.1: receita de ativações instaladas no mês.
  const totalCoreMes = rows
    .filter((v) => v.status === "instalado")
    .filter(
      (v) =>
        incluiNovosNaFaixa ||
        ehCorePap(v.tipo_protocolo ?? "", v.produto ?? "", listaProdutos),
    )
    .reduce((s, v) => s + Number(v.valor ?? 0), 0);

  // Índice de cancelamento (M-5): informado manualmente em Regras de comissionamento.
  // Sem informe, opcionalmente estima pelas vendas canceladas do próprio mês.
  const canceladas = rows.filter((v) => v.status === "cancelado").length;
  const instaladas = rows.filter((v) => v.status === "instalado").length;
  const denom = canceladas + instaladas;
  const indiceCancel =
    cond?.indice_cancelamento !== undefined && cond?.indice_cancelamento !== null
      ? Number(cond.indice_cancelamento)
      : estimarCancel && denom > 0
        ? canceladas / denom
        : null;
  const metaCancel = Number(faixaPap(listaFaixas, totalCoreMes)?.meta_max_cancel ?? 0);
  const dentroMetaCancelamento = indiceCancel !== null && indiceCancel <= metaCancel;

  await Promise.all(
    rows.map((v) => {
      const { valor } = comissaoPap({
        tipoProtocolo: v.tipo_protocolo ?? "",
        produto: v.produto ?? "",
        valor: Number(v.valor ?? 0),
        instalado: v.status === "instalado",
        totalCoreMes,
        faixas: listaFaixas,
        produtos: listaProdutos,
        dentroMetaCancelamento,
      });
      return supabase.from("vendas_pap").update({ comissao: valor }).eq("id", v.id);
    }),
  );
}
