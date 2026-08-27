import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { mesAtual } from "@/components/dashboard/filtros-ranking";

type Linha = {
  vendedor_id: string;
  nome: string;
  canal: string;
  indice: string;
  ferias: boolean;
  observacao: string;
};

export function Condicionantes({ editavel }: { editavel: boolean }) {
  const qc = useQueryClient();
  const [mes, setMes] = useState(mesAtual());
  const [rows, setRows] = useState<Linha[]>([]);
  const [saving, setSaving] = useState(false);
  const mesRef = `${mes}-01`;

  const q = useQuery({
    queryKey: ["condicionantes", mesRef],
    queryFn: async () => {
      const [{ data: profs, error: e1 }, { data: cond, error: e2 }] = await Promise.all([
        supabase.from("profiles").select("id, nome, canal, ativo").order("nome"),
        supabase
          .from("comissao_condicionantes")
          .select("vendedor_id, indice_cancelamento, em_ferias_atestado, observacao")
          .eq("mes_ref", mesRef),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const byId = new Map((cond ?? []).map((c) => [c.vendedor_id, c]));
      return (profs ?? [])
        .filter((p) => p.ativo)
        .map<Linha>((p) => {
          const c = byId.get(p.id);
          return {
            vendedor_id: p.id,
            nome: p.nome,
            canal: p.canal,
            indice: c ? String(Number(c.indice_cancelamento) * 100) : "",
            ferias: !!c?.em_ferias_atestado,
            observacao: c?.observacao ?? "",
          };
        });
    },
  });

  useEffect(() => {
    if (q.data) setRows(q.data);
  }, [q.data]);

  function set(i: number, patch: Partial<Linha>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function salvar() {
    setSaving(true);
    try {
      const payload = rows
        .filter((r) => r.indice !== "" || r.ferias || r.observacao.trim())
        .map((r) => ({
          vendedor_id: r.vendedor_id,
          mes_ref: mesRef,
          indice_cancelamento: (parseFloat(r.indice.replace(",", ".")) || 0) / 100,
          em_ferias_atestado: r.ferias,
          observacao: r.observacao.trim() || null,
        }));
      if (payload.length) {
        const { error } = await supabase
          .from("comissao_condicionantes")
          .upsert(payload, { onConflict: "vendedor_id,mes_ref" });
        if (error) throw error;
      }
      toast.success("Condicionantes salvos");
      await qc.invalidateQueries({ queryKey: ["condicionantes", mesRef] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Condicionantes por consultor</CardTitle>
          <CardDescription>
            Informações exigidas pelas circulares que não constam no registro de vendas. O índice de
            cancelamento (M-5) libera o acelerador de baixo cancelamento da Tabela 8.1 do PAP quando
            fica dentro da meta máxima da faixa.
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Input
            type="month"
            className="h-9 w-[150px]"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
          />
          {editavel && (
            <Button size="sm" onClick={salvar} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              Salvar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Consultor</th>
                  <th className="px-2 py-2 font-medium">Canal</th>
                  <th className="px-2 py-2 font-medium">Índice cancel. M-5 (%)</th>
                  <th className="px-2 py-2 font-medium">Férias / atestado</th>
                  <th className="px-2 py-2 font-medium">Observação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.vendedor_id} className="border-b last:border-0">
                    <td className="px-2 py-1.5">{r.nome}</td>
                    <td className="px-2 py-1.5 uppercase text-muted-foreground">{r.canal}</td>
                    <td className="px-2 py-1.5">
                      <Input
                        className="h-8 w-24"
                        inputMode="decimal"
                        placeholder="—"
                        disabled={!editavel}
                        value={r.indice}
                        onChange={(e) => set(i, { indice: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Checkbox
                        checked={r.ferias}
                        disabled={!editavel}
                        onCheckedChange={(v) => set(i, { ferias: !!v })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        className="h-8"
                        disabled={!editavel}
                        value={r.observacao}
                        onChange={(e) => set(i, { observacao: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">
                      Nenhum consultor disponível.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
