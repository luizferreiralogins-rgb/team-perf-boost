// Faixa atual do consultor no mês — Loja (3 faixas) e PAP (11 faixas)
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  diferencaTicket,
  ehCorePap,
  faixaEfetivaLoja,
  faixaPap,
  tipoComissaoLoja,
  type LojaMeta,
  type LojaNovoProduto,
  type PapFaixa,
  type PapNovoProduto,
} from "@/lib/comissao";

export type FaixaAtual = {
  canal: "loja" | "pap";
  faixa: number;
  total: number;
  base: number;
  /** Loja: faixa considerando apenas % de renovações com móvel. */
  faixaMovel?: number;
  /** Loja: faixa considerando apenas a receita acumulada. */
  faixaReceita?: number;
  /** O que falta para avançar para a próxima faixa (null quando já está na máxima). */
  proxima: { movel: number; receita: number } | null;
};

export function mesRefAtual() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-01`;
}

async function carregarFaixas(ids: string[] | null, mesRefISO: string) {
  const lojaQ = supabase
    .from("vendas_loja")
    .select("vendedor_id, valor_novo, valor_antigo, classe_protocolo, contem_movel, tecnologia")
    .eq("mes_ref", mesRefISO)
    .eq("status", "instalado");
  const papQ = supabase
    .from("vendas_pap")
    .select("vendedor_id, valor, produto, tipo_protocolo")
    .eq("mes_ref", mesRefISO)
    .eq("status", "instalado");
  const profQ = supabase.from("profiles").select("id, canal");
  if (ids) {
    lojaQ.in("vendedor_id", ids);
    papQ.in("vendedor_id", ids);
    profQ.in("id", ids);
  }

  const [loja, pap, profs, metas, novosLoja, faixasPap, produtosPap] = await Promise.all([
    lojaQ,
    papQ,
    profQ,
    supabase.from("parametros_loja_metas").select("faixa, meta_receita, meta_renov_movel"),
    supabase.from("parametros_loja_novos_produtos").select("codigo, nome, percentual"),
    supabase
      .from("parametros_pap_faixas")
      .select("faixa, receita_de, receita_ate, pct_comissao, acelerador_baixo_cancel, bonus_venda_indireta")
      .order("receita_de"),
    supabase.from("parametros_pap_novos_produtos").select("codigo, nome, percentual, limitado, limite"),
  ]);

  const metasL = (metas.data ?? []) as LojaMeta[];
  const novosL = (novosLoja.data ?? []) as LojaNovoProduto[];
  const faixasP = (faixasPap.data ?? []) as PapFaixa[];
  const produtosP = (produtosPap.data ?? []) as PapNovoProduto[];

  const totalPap = faixasP.length || 11;
  const acc = new Map<
    string,
    { receitaLoja: number; renovTotal: number; renovMovel: number; corePap: number }
  >();
  const get = (id: string) => {
    const cur =
      acc.get(id) ?? { receitaLoja: 0, renovTotal: 0, renovMovel: 0, corePap: 0 };
    acc.set(id, cur);
    return cur;
  };

  for (const v of loja.data ?? []) {
    const cur = get(v.vendedor_id);
    const diff = diferencaTicket(Number(v.valor_novo ?? 0), Number(v.valor_antigo ?? 0));
    if (diff > 0) cur.receitaLoja += diff;
    const tipo = tipoComissaoLoja(
      v.classe_protocolo ?? "",
      !!v.contem_movel,
      v.tecnologia ?? "",
      novosL,
    );
    if (tipo === "Renovação com Mobilidade" || tipo === "Renovação sem Mobilidade") {
      cur.renovTotal += 1;
      if (tipo === "Renovação com Mobilidade") cur.renovMovel += 1;
    }
  }
  for (const v of pap.data ?? []) {
    const cur = get(v.vendedor_id);
    if (ehCorePap(v.tipo_protocolo ?? "", v.produto ?? "", produtosP)) {
      cur.corePap += Number(v.valor ?? 0);
    }
  }

  const out = new Map<string, FaixaAtual>();
  for (const p of profs.data ?? []) {
    const canal = (p.canal ?? "loja") as "loja" | "pap";
    const a = acc.get(p.id) ?? { receitaLoja: 0, renovTotal: 0, renovMovel: 0, corePap: 0 };
    if (canal === "pap") {
      const row = faixaPap(faixasP, a.corePap);
      const ordP = [...faixasP].sort((x, y) => Number(x.receita_de) - Number(y.receita_de));
      const prox = ordP.find((f) => Number(f.receita_de) > a.corePap);
      out.set(p.id, {
        canal,
        faixa: Number(row?.faixa ?? 1),
        total: totalPap,
        base: a.corePap,
        proxima: prox
          ? { movel: 0, receita: Math.max(0, Number(prox.receita_de) - a.corePap) }
          : null,
      });
    } else {
      const ratio = a.renovTotal > 0 ? a.renovMovel / a.renovTotal : 0;
      const faixa = faixaEfetivaLoja(metasL, a.receitaLoja, ratio);
      const ord = [...metasL].sort((x, y) => x.faixa - y.faixa);
      const atualRow = ord.find((x) => x.faixa === faixa);
      const proxRow = ord.find((x) => x.faixa === faixa + 1);
      let proxima: { movel: number; receita: number } | null = null;
      if (proxRow) {
        const metaReceita = Number(atualRow?.meta_receita ?? 0);
        const receita = a.receitaLoja > metaReceita ? 0 : Math.max(0, metaReceita - a.receitaLoja);
        const metaRatio = Number(proxRow.meta_renov_movel ?? 0);
        let movel = 0;
        if (ratio < metaRatio && metaRatio < 1) {
          movel = Math.max(
            0,
            Math.ceil((metaRatio * a.renovTotal - a.renovMovel) / (1 - metaRatio)),
          );
        }
        proxima = { movel, receita };
      }
      let lvlMovel = ord.length ? ord[0].faixa : 1;
      for (const x of ord) if (ratio >= Number(x.meta_renov_movel)) lvlMovel = x.faixa;
      const alvoRec = ord.find((x) => a.receitaLoja <= Number(x.meta_receita));
      const lvlReceita = alvoRec ? alvoRec.faixa : (ord.length ? ord[ord.length - 1].faixa : 1);
      out.set(p.id, {
        canal,
        faixa,
        total: 3,
        base: a.receitaLoja,
        proxima,
        faixaMovel: Math.max(1, Math.min(3, lvlMovel)),
        faixaReceita: Math.max(1, Math.min(3, lvlReceita)),
      });
    }
  }
  return out;
}

/** Faixa atual de um único consultor (mês atual). */
export function useFaixaAtual(uid?: string, mesRefISO = mesRefAtual()) {
  return useQuery({
    queryKey: ["faixa-atual", uid, mesRefISO],
    enabled: !!uid,
    staleTime: 60_000,
    queryFn: async () => (await carregarFaixas([uid!], mesRefISO)).get(uid!) ?? null,
  });
}

/** Faixa atual de vários consultores (mês atual). */
export function useFaixasEquipe(ids: string[], mesRefISO = mesRefAtual()) {
  const key = [...ids].sort().join(",");
  return useQuery({
    queryKey: ["faixas-equipe", key, mesRefISO],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: () => carregarFaixas(ids, mesRefISO),
  });
}

export function rotuloFaixa(f: FaixaAtual | null | undefined) {
  if (!f) return null;
  return `Faixa ${f.faixa}/${f.total}`;
}
