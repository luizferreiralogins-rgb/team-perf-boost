import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { mesAtual } from "@/components/dashboard/filtros-ranking";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Linha = {
  id: string;
  nome: string;
  comissao: number;
  blQtd: number;
  mvQtd: number;
  renovQtd: number;
  renovRs: number;
};

const isBL = (t?: string | null) =>
  !!t && (/banda\s*larga/i.test(t) || /fibra|fttx|internet/i.test(t));
const isMovel = (t?: string | null) => !!t && /m[óo]vel|movel|celular|5g|4g/i.test(t);

/** Top 3 do time (consultores com o mesmo gerente) por indicador. */
export function RankingTime({ uid, mes }: { uid?: string; mes: string }) {
  const mesRef = `${mes}-01`;

  const { data, isLoading } = useQuery({
    queryKey: ["ranking-time", uid, mesRef],
    enabled: !!uid,
    staleTime: 30_000,
    queryFn: async (): Promise<Linha[]> => {
      const { data: me } = await supabase
        .from("profiles")
        .select("id, gerente_id")
        .eq("id", uid!)
        .maybeSingle();

      let colegas: { id: string; nome: string }[] = [];
      if (me?.gerente_id) {
        const { data: ps } = await supabase
          .from("profiles")
          .select("id, nome")
          .eq("gerente_id", me.gerente_id)
          .eq("ativo", true);
        colegas = ps ?? [];
      }
      const ids = Array.from(new Set([...colegas.map((c) => c.id), uid!]));
      const nomes = new Map(colegas.map((c) => [c.id, c.nome || "—"]));

      const lojaQ = supabase
        .from("vendas_loja")
        .select("vendedor_id, tecnologia, contem_movel, classe_protocolo, qtd_linhas, valor_novo, valor_antigo, comissao, status")
        .in("vendedor_id", ids);
      const papQ = supabase
        .from("vendas_pap")
        .select("vendedor_id, tecnologia, produto, tipo_protocolo, qtd_linhas, valor, valor_novo, valor_antigo, comissao, status")
        .in("vendedor_id", ids);
      if (mes === mesAtual()) {
        lojaQ.is("arquivada_em", null);
        papQ.is("arquivada_em", null);
      } else {
        lojaQ.eq("mes_ref", mesRef);
        papQ.eq("mes_ref", mesRef);
      }
      const [loja, pap] = await Promise.all([lojaQ, papQ]);

      const linhas = new Map<string, Linha>();
      const get = (id: string) => {
        let l = linhas.get(id);
        if (!l) {
          l = { id, nome: nomes.get(id) ?? "—", comissao: 0, blQtd: 0, mvQtd: 0, renovQtd: 0, renovRs: 0 };
          linhas.set(id, l);
        }
        return l;
      };
      for (const id of ids) get(id);

      for (const v of loja.data ?? []) {
        const l = get(v.vendedor_id);
        const novo = Number(v.valor_novo ?? 0);
        const antigo = Number(v.valor_antigo ?? 0);
        const val = antigo > 0 ? novo - antigo : novo;
        const qtd = Number(v.qtd_linhas ?? 0);
        const renov = (v.classe_protocolo ?? "").startsWith("Renovação");
        if (isBL(v.tecnologia) && !renov) l.blQtd++;
        if (isMovel(v.tecnologia) || v.contem_movel || qtd > 0) l.mvQtd += qtd;
        if (renov) {
          l.renovQtd++;
          l.renovRs += val;
        }
        if (v.status === "instalado") l.comissao += Number(v.comissao ?? 0);
      }
      for (const v of pap.data ?? []) {
        const l = get(v.vendedor_id);
        const novo = Number(v.valor_novo ?? 0) || Number(v.valor ?? 0);
        const antigo = Number(v.valor_antigo ?? 0);
        const val = antigo > 0 ? novo - antigo : novo;
        const desc = `${v.produto ?? ""} ${v.tecnologia ?? ""}`;
        const qtd = Number(v.qtd_linhas ?? 0);
        const renov = (v.tipo_protocolo ?? "").startsWith("Renovação");
        if (isBL(desc) && !renov) l.blQtd++;
        if (isMovel(desc) || qtd > 0) l.mvQtd += qtd;
        if (renov) {
          l.renovQtd++;
          l.renovRs += val;
        }
        if (v.status === "instalado") l.comissao += Number(v.comissao ?? 0);
      }

      // nome próprio
      const minha = linhas.get(uid!);
      if (minha && minha.nome === "—") {
        const { data: p } = await supabase.from("profiles").select("nome").eq("id", uid!).maybeSingle();
        minha.nome = p?.nome || "Você";
      }

      return [...linhas.values()];
    },
  });

  if (!uid) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Top 3 do time
      </h2>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <TopCard
            titulo="Comissão atual (R$)"
            linhas={data ?? []}
            uid={uid}
            valorDe={(l) => l.comissao}
            format={brl}
          />
          <TopCard titulo="Banda Larga (Qtd)" linhas={data ?? []} uid={uid} valorDe={(l) => l.blQtd} />
          <TopCard titulo="Móvel (Qtd)" linhas={data ?? []} uid={uid} valorDe={(l) => l.mvQtd} />
          <TopCard
            titulo="Renovações (Qtd / R$)"
            linhas={data ?? []}
            uid={uid}
            valorDe={(l) => l.renovRs}
            format={(_n, l) => `${l.renovQtd} · ${brl(l.renovRs)}`}
          />
        </div>
      )}
    </div>
  );
}

function TopCard({
  titulo,
  linhas,
  uid,
  valorDe,
  format,
}: {
  titulo: string;
  linhas: Linha[];
  uid: string;
  valorDe: (l: Linha) => number;
  format?: (n: number, l: Linha) => string;
}) {
  const top = [...linhas].sort((a, b) => valorDe(b) - valorDe(a)).slice(0, 3);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {top.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados.</p>
        ) : (
          top.map((l, i) => (
            <div
              key={l.id}
              className={`flex items-center gap-2 text-sm ${l.id === uid ? "font-semibold text-primary" : ""}`}
            >
              <span className="w-5 text-xs font-bold text-muted-foreground">{i + 1}º</span>
              <span className="truncate">{l.nome.split(" ")[0]}</span>
              <span className="ml-auto font-semibold">
                {format ? format(valorDe(l), l) : valorDe(l)}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
