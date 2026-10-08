import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatarMinutos, mapaTempos, useTempos } from "@/hooks/use-tempos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useFaixasEquipe, rotuloFaixa } from "@/lib/faixa-atual";

export function ProdutividadeTime() {
  const hoje = new Date();
  const inicioMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
  const fimMes = (() => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const tempos = useTempos();

  const { data, isLoading } = useQuery({
    queryKey: ["produtividade-time", inicioMes],
    queryFn: async () => {
      const [atend, loja, pap, leads, profs, pvc, pva, prosp] = await Promise.all([
        supabase
          .from("atendimentos")
          .select("usuario_id, tipo")
          .gte("data_atendimento", inicioMes)
          .lte("data_atendimento", fimMes),
        supabase.from("vendas_loja").select("vendedor_id").gte("created_at", `${inicioMes}T00:00:00`),
        supabase.from("vendas_pap").select("vendedor_id").gte("created_at", `${inicioMes}T00:00:00`),
        supabase
          .from("leads")
          .select("vendedor_id, created_at, updated_at")
          .or(`created_at.gte.${inicioMes}T00:00:00,updated_at.gte.${inicioMes}T00:00:00`),
        supabase.from("profiles").select("id, nome"),
        supabase.from("pos_venda_contatos").select("criado_por").gte("created_at", `${inicioMes}T00:00:00`),
        supabase.from("pos_venda_ajustes").select("criado_por").gte("created_at", `${inicioMes}T00:00:00`),
        supabase
          .from("prospeccoes")
          .select("vendedor_id")
          .gte("updated_at", `${inicioMes}T00:00:00`)
          .or("status.not.is.null,data_contato.not.is.null,observacao.not.is.null"),
      ]);

      const nomes = new Map((profs.data ?? []).map((p) => [p.id, p.nome || "—"]));
      const linhas = new Map<
        string,
        { atendimentos: number; vendas: number; leads: number; posVendas: number; prospeccoes: number; tipos: Record<string, number> }
      >();
      const get = (id: string) => {
        const cur = linhas.get(id) ?? { atendimentos: 0, vendas: 0, leads: 0, posVendas: 0, prospeccoes: 0, tipos: {} };
        linhas.set(id, cur);
        return cur;
      };
      const bump = (id: string, k: "atendimentos" | "vendas" | "leads" | "posVendas" | "prospeccoes", n = 1) => {
        get(id)[k] += n;
      };
      for (const a of atend.data ?? []) {
        const cur = get(a.usuario_id);
        cur.atendimentos += 1;
        cur.tipos[a.tipo] = (cur.tipos[a.tipo] ?? 0) + 1;
      }
      for (const v of [...(loja.data ?? []), ...(pap.data ?? [])]) bump(v.vendedor_id, "vendas");
      for (const l of leads.data ?? []) {
        const dia = (s: string) => s.slice(0, 10);
        bump(l.vendedor_id, "leads", dia(l.created_at) !== dia(l.updated_at) ? 2 : 1);
      }

      for (const c of [...(pvc.data ?? []), ...(pva.data ?? [])]) bump(c.criado_por, "posVendas");
      for (const p of prosp.data ?? []) bump(p.vendedor_id, "prospeccoes");

      return [...linhas.entries()]
        .map(([id, v]) => ({
          id,
          nome: nomes.get(id) ?? "—",
          ...v,
          total: v.atendimentos + v.vendas + v.leads + v.posVendas + v.prospeccoes,
        }))
        .sort((a, b) => b.total - a.total);
    },
  });

  const diasDecorridos = Math.max(1, hoje.getDate());
  const faixas = useFaixasEquipe((data ?? []).map((l) => l.id));


  const mapa = mapaTempos(tempos.data);
  const minutosDe = (l: {
    tipos: Record<string, number>;
    vendas: number;
    leads: number;
    posVendas: number;
    prospeccoes: number;
  }) =>
    Object.entries(l.tipos).reduce((s, [t, n]) => s + n * (mapa.get(t) ?? 0), 0) +
    l.vendas * (mapa.get("venda") ?? 0) +
    l.leads * (mapa.get("lead") ?? 0) +
    l.posVendas * (mapa.get("pos_venda") ?? 5) +
    l.prospeccoes * (mapa.get("prospeccao") ?? 5);

  const minutosTime = (data ?? []).reduce((s, l) => s + minutosDe(l), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Produtividade do time — mês atual</CardTitle>
        <CardDescription>
          Total do mês e média diária (dividida pelos {diasDecorridos} dias decorridos).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <Skeleton className="h-24 w-full" />}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma atividade registrada neste mês.</p>
        )}
        {!isLoading && (data?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-8 rounded-md border border-border bg-muted/40 p-3">
            <div>
              <span className="block text-xs text-muted-foreground">
                Tempo produtivo do time — acumulado mês
              </span>
              <span className="text-xl font-bold">{formatarMinutos(minutosTime)}</span>
            </div>
            <div>
              <span className="block text-xs text-muted-foreground">
                Tempo produtivo do time — média dia
              </span>
              <span className="text-xl font-bold">
                {formatarMinutos(minutosTime / diasDecorridos)}
              </span>
            </div>
          </div>
        )}
        {(data ?? []).map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
            <span className="font-medium">{l.nome}</span>
            {faixas.data?.get(l.id) && (
              <Badge variant="outline" className="font-semibold">
                {faixas.data.get(l.id)!.canal === "pap" ? "PAP" : "Loja"} ·{" "}
                {rotuloFaixa(faixas.data.get(l.id))}
              </Badge>
            )}

            <span className="ml-auto text-xs text-muted-foreground">
              {l.atendimentos} atend. · {l.vendas} vendas · {l.leads} leads · {l.posVendas} pós vendas · {l.prospeccoes} prospecções
              <br className="sm:hidden" />
              <span className="sm:ml-2">
                ⏱ {formatarMinutos(minutosDe(l))} · {formatarMinutos(minutosDe(l) / diasDecorridos)}
                /dia
              </span>
            </span>
            <span className="w-20 text-right">
              <span className="block text-lg font-bold leading-none">{l.total}</span>
              <span className="block text-[11px] text-muted-foreground">
                {(l.total / diasDecorridos).toFixed(1)}/dia
              </span>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

