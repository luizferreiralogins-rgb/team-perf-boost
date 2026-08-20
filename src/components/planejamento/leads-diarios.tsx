import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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

/** Visão do consultor PAP: informa leads por dia; fechamentos vêm das vendas do dia. */
export function LeadsDiariosConsultor({ mes, uid }: { mes: string; uid?: string }) {
  const qc = useQueryClient();
  const resumo = useResumoPap(mes);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});

  const dias = useMemo(() => {
    const [y, m] = mes.split("-").map(Number);
    if (!y || !m) return [];
    const total = new Date(y, m, 0).getDate();
    return Array.from({ length: total }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`);
  }, [mes]);

  const porDia = useMemo(() => {
    const m = new Map<string, ResumoLinha>();
    for (const l of resumo.data ?? []) if (l.consultor_id === uid) m.set(l.data, l);
    return m;
  }, [resumo.data, uid]);

  const salvar = useMutation({
    mutationFn: async (v: { data: string; leads: number }) => {
      if (!uid) throw new Error("Sessão expirada.");
      const { error } = await supabase
        .from("planejamento_leads_diarios")
        .upsert(
          { consultor_id: uid, data: v.data, leads: v.leads },
          { onConflict: "consultor_id,data" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planejamento-resumo-pap"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const totais = useMemo(() => {
    let leads = 0,
      bl = 0,
      movel = 0;
    porDia.forEach((l) => {
      leads += l.leads;
      bl += l.bl;
      movel += l.movel;
    });
    return { leads, bl, movel };
  }, [porDia]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Minha prospecção diária</CardTitle>
        <p className="text-sm text-muted-foreground">
          Informe os leads prospectados em cada dia. Fech. BL e Fech. Móvel são calculados
          automaticamente pelas suas vendas registradas no dia (instaladas ou não).
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {resumo.isLoading ? (
          <Skeleton className="m-4 h-48" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                  <th className="w-[30%]">Data</th>
                  <th className="w-[25%]">Leads</th>
                  <th className="w-[20%] text-right">Fech. BL</th>
                  <th className="w-[25%] text-right">Fech. Móvel</th>
                </tr>
              </thead>
              <tbody>
                {dias.map((d) => {
                  const l = porDia.get(d);
                  return (
                    <tr key={d} className="border-t border-border [&>td]:px-3 [&>td]:py-1">
                      <td>{fmt(d)}</td>
                      <td>
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-24"
                          value={rascunho[d] ?? (l?.leads ? String(l.leads) : "")}
                          onChange={(e) => setRascunho((p) => ({ ...p, [d]: e.target.value }))}
                          onBlur={(e) => {
                            const n = e.target.value === "" ? 0 : Number(e.target.value);
                            if (n !== (l?.leads ?? 0)) salvar.mutate({ data: d, leads: n });
                          }}
                        />
                      </td>
                      <td className="text-right">{l?.bl ?? 0}</td>
                      <td className="text-right">{l?.movel ?? 0}</td>
                    </tr>
                  );
                })}
                <tr className="border-t border-border bg-muted/30 font-medium [&>td]:px-3 [&>td]:py-2">
                  <td>Total do mês</td>
                  <td>{totais.leads}</td>
                  <td className="text-right">{totais.bl}</td>
                  <td className="text-right">{totais.movel}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
