import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";


export type ResumoLinha = {
  data: string;
  consultor_id: string;
  consultor_nome: string;
  leads: number;
  bl: number;
  movel: number;
};

export function useResumoPap(mes: string) {
  return useQuery({
    queryKey: ["planejamento-resumo-pap", mes],
    queryFn: async (): Promise<ResumoLinha[]> => {
      const { data, error } = await supabase.rpc("planejamento_resumo_pap", {
        _mes: `${mes}-01`,
      });
      if (error) throw error;
      return (data ?? []) as ResumoLinha[];
    },
  });
}

export function agregarPorData(linhas: ResumoLinha[]) {
  const m = new Map<string, { leads: number; bl: number; movel: number }>();
  for (const l of linhas) {
    const a = m.get(l.data) ?? { leads: 0, bl: 0, movel: 0 };
    a.leads += l.leads;
    a.bl += l.bl;
    a.movel += l.movel;
    m.set(l.data, a);
  }
  return m;
}

const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR");

/** Detalhe por consultor de um dia (visão Líder PAP). */
export function DetalheDiaDialog({
  dia,
  linhas,
  onOpenChange,
}: {
  dia: string | null;
  linhas: ResumoLinha[];
  onOpenChange: (v: boolean) => void;
}) {
  const doDia = linhas
    .filter((l) => l.data === dia)
    .sort((a, b) => a.consultor_nome.localeCompare(b.consultor_nome));

  return (
    <Dialog open={!!dia} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resumo por consultor</DialogTitle>
          <DialogDescription>{dia ? fmt(dia) : ""}</DialogDescription>
        </DialogHeader>
        {doDia.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum registro neste dia.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="[&>th]:py-1 [&>th]:font-medium">
                <th>Consultor</th>
                <th className="text-right">Leads</th>
                <th className="text-right">Fech. BL</th>
                <th className="text-right">Fech. Móvel</th>
              </tr>
            </thead>
            <tbody>
              {doDia.map((l) => (
                <tr key={l.consultor_id} className="border-t border-border [&>td]:py-1">
                  <td>{l.consultor_nome}</td>
                  <td className="text-right">{l.leads}</td>
                  <td className="text-right">{l.bl}</td>
                  <td className="text-right">{l.movel}</td>
                </tr>
              ))}
              <tr className="border-t border-border font-medium [&>td]:py-1">
                <td>Total</td>
                <td className="text-right">{doDia.reduce((s, l) => s + l.leads, 0)}</td>
                <td className="text-right">{doDia.reduce((s, l) => s + l.bl, 0)}</td>
                <td className="text-right">{doDia.reduce((s, l) => s + l.movel, 0)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Célula editável de leads do dia (consultor PAP), salva na própria linha da ação. */
export function CelulaLeadsDia({
  data,
  uid,
  valor,
}: {
  data: string | null;
  uid?: string;
  valor: number;
}) {
  const qc = useQueryClient();
  const [rascunho, setRascunho] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: async (leads: number) => {
      if (!uid || !data) throw new Error("Sessão expirada.");
      const { error } = await supabase
        .from("planejamento_leads_diarios")
        .upsert({ consultor_id: uid, data, leads }, { onConflict: "consultor_id,data" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planejamento-resumo-pap"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data) return <span className="text-muted-foreground">—</span>;

  return (
    <Input
      type="number"
      min={0}
      className="h-8 w-16"
      value={rascunho ?? (valor ? String(valor) : "")}
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={(e) => {
        const n = e.target.value === "" ? 0 : Number(e.target.value);
        setRascunho(null);
        if (n !== valor) salvar.mutate(n);
      }}
    />
  );
}

