import { useMemo } from "react";
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




/** Top 3 do time (consultores com o mesmo gerente) por indicador. */
export function RankingTime({ uid, meses }: { uid?: string; meses: string[] }) {
  const ordenados = useMemo(() => [...meses].sort(), [meses]);

  const { data, isLoading } = useQuery({
    queryKey: ["ranking-time", uid, ordenados.join(",")],
    enabled: !!uid && ordenados.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Linha[]> => {
      const resultados = await Promise.all(
        ordenados.map((m) =>
          supabase.rpc("ranking_time", {
            _mes_ref: `${m}-01`,
            _usar_ativas: m === mesAtual(),
          }),
        ),
      );
      const porId = new Map<string, Linha>();
      for (const res of resultados) {
        if (res.error) throw res.error;
        for (const r of (res.data ?? []) as any[]) {
          const cur = porId.get(r.id) ?? {
            id: r.id as string,
            nome: (r.nome as string) || "—",
            comissao: 0,
            blQtd: 0,
            mvQtd: 0,
            renovQtd: 0,
            renovRs: 0,
          };
          cur.comissao += Number(r.comissao ?? 0);
          cur.blQtd += Number(r.bl_qtd ?? 0);
          cur.mvQtd += Number(r.mv_qtd ?? 0);
          cur.renovQtd += Number(r.renov_qtd ?? 0);
          cur.renovRs += Number(r.renov_rs ?? 0);
          porId.set(cur.id, cur);
        }
      }
      return [...porId.values()];
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
