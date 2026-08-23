// Recalcula as comissões de um vendedor em um mês, aplicando as regras vigentes.
// Necessário porque tanto Loja (faixa efetiva) quanto PAP (faixa por receita
// acumulada) dependem do conjunto de vendas do mês, não apenas da venda editada.

import { supabase } from "@/integrations/supabase/client";
import {
  comissaoLojaNaFaixa,
  comissaoPap,
  diferencaTicket,
  faixaEfetivaLoja,
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
      .select("diff_de, diff_ate, faixa_0, faixa_1, faixa_2, faixa_3"),
    supabase.from("parametros_loja_metas").select("faixa, meta_receita, meta_renov_movel"),
    supabase.from("parametros_loja_novos_produtos").select("codigo, nome, percentual"),
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
  const [{ data: faixas }, { data: produtos }, { data: vendas }] = await Promise.all([
    supabase
      .from("parametros_pap_faixas")
      .select(
        "faixa, receita_de, receita_ate, pct_comissao, meta_max_cancel, acelerador_baixo_cancel, bonus_venda_indireta",
      ),
    supabase.from("parametros_pap_novos_produtos").select("codigo, nome, percentual, limitado, limite"),
    supabase
      .from("vendas_pap")
      .select("id, valor, produto, tipo_protocolo, status")
      .eq("vendedor_id", vendedorId)
      .eq("mes_ref", mesRef),
  ]);

  const listaFaixas = (faixas ?? []) as PapFaixa[];
  const listaProdutos = (produtos ?? []) as PapNovoProduto[];
  const rows = vendas ?? [];
  if (!rows.length) return;

  // Faixa PAP: considera TODA a receita instalada do mês (inclui produtos da 8.2).
  const totalCoreMes = rows
    .filter((v) => v.status === "instalado")
    .reduce((s, v) => s + Number(v.valor ?? 0), 0);

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
      });
      return supabase.from("vendas_pap").update({ comissao: valor }).eq("id", v.id);
    }),
  );
}
