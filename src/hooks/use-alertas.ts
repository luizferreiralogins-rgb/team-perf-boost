import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const hoje = () => new Date().toISOString().slice(0, 10);
const mesAtual = () => new Date().toISOString().slice(0, 7);

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const normProt = (s: string | null | undefined) => (s ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

export type Alertas = {
  leads: number;
  vendas: number;
  contestacoes: number;
  tarefas: number;
};

/** Contadores de alerta exibidos ao lado dos itens do menu lateral. */
export function useAlertas() {
  return useQuery({
    queryKey: ["alertas-menu"],
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async (): Promise<Alertas> => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) return { leads: 0, vendas: 0, contestacoes: 0, tarefas: 0 };

      const hj = hoje();
      const mes = mesAtual();
      const inicio = `${mes}-01`;
      const fimDate = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0);
      const fim = `${mes}-${String(fimDate.getDate()).padStart(2, "0")}`;
      const abertos = ["pendente", "em_analise"] as const;

      const [leads, vLoja, vPap, tarefas, nativas, instLoja, instPap] = await Promise.all([
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .in("status", ["contato_feito", "negociando"])
          .not("proximo_contato_em", "is", null)
          .lt("proximo_contato_em", hj),
        supabase.from("vendas_loja").select("id", { count: "exact", head: true }).in("status", abertos),
        supabase.from("vendas_pap").select("id", { count: "exact", head: true }).in("status", abertos),
        supabase
          .from("tarefas")
          .select("id", { count: "exact", head: true })
          .in("status", ["pendente", "iniciada"])
          .lt("data_venc", hj),
        supabase
          .from("contestacao_vendas_nativas")
          .select("protocolo, nome_cliente")
          .eq("mes_ref", inicio)
          .limit(5000),
        supabase
          .from("vendas_loja")
          .select("protocolo, nome_cliente")
          .eq("status", "instalado")
          .gte("data_ativacao", inicio)
          .lte("data_ativacao", fim)
          .limit(5000),
        supabase
          .from("vendas_pap")
          .select("protocolo, nome_cliente")
          .eq("status", "instalado")
          .gte("data_ativacao", inicio)
          .lte("data_ativacao", fim)
          .limit(5000),
      ]);

      const nat = nativas.data ?? [];
      const vend = [...(instLoja.data ?? []), ...(instPap.data ?? [])];

      let contestacoes = 0;
      if (nat.length > 0) {
        const protVendas = new Set(vend.map((v) => normProt(v.protocolo)).filter(Boolean));
        const nomeVendas = new Set(vend.map((v) => norm(v.nome_cliente)).filter(Boolean));
        const protNativas = new Set(nat.map((n) => normProt(n.protocolo)).filter(Boolean));
        const nomeNativas = new Set(nat.map((n) => norm(n.nome_cliente)).filter(Boolean));

        const soNativo = nat.filter(
          (n) =>
            !(normProt(n.protocolo) && protVendas.has(normProt(n.protocolo))) &&
            !nomeVendas.has(norm(n.nome_cliente)),
        ).length;
        const soConsultor = vend.filter(
          (v) =>
            !(normProt(v.protocolo) && protNativas.has(normProt(v.protocolo))) &&
            !nomeNativas.has(norm(v.nome_cliente)),
        ).length;
        contestacoes = soNativo + soConsultor;
      }

      return {
        leads: leads.count ?? 0,
        vendas: (vLoja.count ?? 0) + (vPap.count ?? 0),
        contestacoes,
        tarefas: tarefas.count ?? 0,
      };
    },
  });
}
