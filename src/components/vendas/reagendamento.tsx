import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type TabelaVenda = "vendas_loja" | "vendas_pap";

export const MOTIVO_MIN = 10;

function fmtDate(d?: string | null) {
  if (!d) return "sem data";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

/** Registra a justificativa do reagendamento. Chamar após salvar a venda. */
export async function registrarReagendamento(params: {
  tabela: TabelaVenda;
  vendaId: string;
  vendedorId: string;
  dataAnterior: string | null;
  dataNova: string | null;
  motivo: string;
}) {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) return;
  await supabase.from("agendamento_historico").insert({
    tabela: params.tabela,
    venda_id: params.vendaId,
    vendedor_id: params.vendedorId,
    data_anterior: params.dataAnterior || null,
    data_nova: params.dataNova || null,
    motivo: params.motivo.trim(),
    criado_por: uid,
  });
}

export function MotivoReagendamentoField({
  value,
  onChange,
  dataAnterior,
  dataNova,
}: {
  value: string;
  onChange: (v: string) => void;
  dataAnterior: string;
  dataNova: string;
}) {
  return (
    <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-4">
      <Label>
        Justificativa do reagendamento <span className="text-destructive">*</span>
      </Label>
      <p className="text-xs text-muted-foreground">
        A data original ({fmtDate(dataAnterior)}) não foi cumprida. Explique o motivo da alteração
        para {fmtDate(dataNova)}.
      </p>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="Ex.: cliente solicitou remarcação; equipe técnica sem disponibilidade; falta de viabilidade no endereço..."
        required
      />
      <p className="text-xs text-muted-foreground">Mínimo de {MOTIVO_MIN} caracteres.</p>
    </div>
  );
}

export function HistoricoReagendamentos({
  tabela,
  vendaId,
}: {
  tabela: TabelaVenda;
  vendaId: string;
}) {
  const q = useQuery({
    queryKey: ["agendamento-historico", tabela, vendaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamento_historico")
        .select("id, data_anterior, data_nova, motivo, created_at, criado_por")
        .eq("tabela", tabela)
        .eq("venda_id", vendaId)
        .order("created_at", { ascending: false });
      const rows = data ?? [];
      const ids = [...new Set(rows.map((r) => r.criado_por))];
      const nomes = new Map<string, string>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, nome")
          .in("id", ids);
        (profs ?? []).forEach((p) => nomes.set(p.id, p.nome));
      }
      return rows.map((r) => ({ ...r, autor: nomes.get(r.criado_por) ?? "Usuário" }));
    },
  });

  const itens = q.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" /> Histórico de reagendamentos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum reagendamento registrado.</p>
        ) : (
          itens.map((i) => (
            <div key={i.id} className="rounded-md border p-3 text-sm">
              <p className="font-medium">
                {fmtDate(i.data_anterior)} → {fmtDate(i.data_nova)}
              </p>
              <p className="mt-1 text-muted-foreground">{i.motivo}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {i.autor} · {new Date(i.created_at).toLocaleString("pt-BR")}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
