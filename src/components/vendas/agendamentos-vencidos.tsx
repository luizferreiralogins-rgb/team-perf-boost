import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

const fmtDate = (d?: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

const hoje = () => new Date().toISOString().slice(0, 10);

type Item = {
  id: string;
  canal: "loja" | "pap";
  vendedor_id: string;
  cliente: string;
  protocolo: string | null;
  data_agendamento: string;
  adiamentos: number;
};

/**
 * Alerta de vendas cujo agendamento venceu sem que "Instalado" fosse marcado.
 * Passe `escopoIds` (gestores) ou `uid` (consultor).
 */
export function AgendamentosVencidos({
  escopoIds,
  uid,
  nomes,
}: {
  escopoIds?: string[];
  uid?: string;
  nomes?: Record<string, string>;
}) {
  const ids = escopoIds ?? (uid ? [uid] : []);

  const q = useQuery({
    enabled: ids.length > 0,
    queryKey: ["agendamentos-vencidos", ids.join(",")],
    queryFn: async (): Promise<Item[]> => {
      const limite = hoje();
      const abertos = ["pendente", "em_analise"];

      const [loja, pap] = await Promise.all([
        supabase
          .from("vendas_loja")
          .select("id, vendedor_id, nome_cliente, protocolo, data_agendamento, agendamento_adiamentos, status")
          .in("vendedor_id", ids)
          .in("status", abertos)
          .not("data_agendamento", "is", null)
          .lt("data_agendamento", limite),
        supabase
          .from("vendas_pap")
          .select("id, vendedor_id, nome_cliente, protocolo, data_agendamento, agendamento_adiamentos, status")
          .in("vendedor_id", ids)
          .in("status", abertos)
          .not("data_agendamento", "is", null)
          .lt("data_agendamento", limite),
      ]);

      const map = (rows: typeof loja.data, canal: "loja" | "pap"): Item[] =>
        (rows ?? []).map((v) => ({
          id: v.id,
          canal,
          vendedor_id: v.vendedor_id,
          cliente: v.nome_cliente,
          protocolo: v.protocolo,
          data_agendamento: v.data_agendamento as string,
          adiamentos: Number(v.agendamento_adiamentos ?? 0),
        }));

      return [...map(loja.data, "loja"), ...map(pap.data, "pap")].sort((a, b) =>
        a.data_agendamento.localeCompare(b.data_agendamento),
      );
    },
    refetchInterval: 120_000,
  });

  const itens = q.data ?? [];
  if (itens.length === 0) return null;

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="min-w-0 space-y-2 text-sm">
          <p className="font-medium">
            {itens.length} venda(s) com agendamento vencido e ainda não marcadas como instaladas.
          </p>
          <ul className="space-y-1">
            {itens.slice(0, 10).map((i) => (
              <li key={`${i.canal}-${i.id}`} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{i.cliente}</span>
                <span className="text-muted-foreground">
                  {i.protocolo ? `Protocolo ${i.protocolo} · ` : ""}
                  Agendado para {fmtDate(i.data_agendamento)}
                  {nomes?.[i.vendedor_id] ? ` · ${nomes[i.vendedor_id]}` : ""}
                </span>
                <Badge variant="outline" className="uppercase">
                  {i.canal}
                </Badge>
                {i.adiamentos > 0 && (
                  <Badge variant="secondary">
                    {i.adiamentos} adiamento{i.adiamentos > 1 ? "s" : ""}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
          {itens.length > 10 && (
            <p className="text-xs text-muted-foreground">
              e mais {itens.length - 10} venda(s)…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
