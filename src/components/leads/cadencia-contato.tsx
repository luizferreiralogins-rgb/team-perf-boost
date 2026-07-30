import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, History, MessageSquarePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Cadência obrigatória de acompanhamento, em dias úteis. */
export const PRAZOS_CADENCIA = [1, 5, 15, 30] as const;

export function prazoDaEtapa(etapa: number) {
  return PRAZOS_CADENCIA[etapa] ?? null;
}

const fmt = (d?: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—");

export function CadenciaLead({
  leadId,
  etapa,
  proximoContatoEm,
  podeRegistrar,
  onRegistrado,
}: {
  leadId: string;
  etapa: number;
  proximoContatoEm: string | null;
  podeRegistrar: boolean;
  onRegistrado: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [texto, setTexto] = useState("");

  const prazo = prazoDaEtapa(etapa);
  const hoje = new Date().toISOString().slice(0, 10);
  const vencido = !!proximoContatoEm && proximoContatoEm < hoje;
  const venceHoje = proximoContatoEm === hoje;

  const historico = useQuery({
    enabled: histOpen,
    queryKey: ["lead-contatos", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_contatos")
        .select("id, etapa, prazo_dias_uteis, observacao, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const registrar = useMutation({
    mutationFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const { error } = await supabase.from("lead_contatos").insert({
        lead_id: leadId,
        vendedor_id: sess.user!.id,
        etapa,
        prazo_dias_uteis: prazo ?? 30,
        observacao: texto.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contato registrado — próximo prazo atualizado.");
      setTexto("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["lead-contatos", leadId] });
      onRegistrado();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao registrar contato."),
  });

  return (
    <div className="mt-2 space-y-1.5 border-t pt-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {prazo ? (
          <Badge
            variant={vencido ? "destructive" : venceHoje ? "default" : "secondary"}
            className="gap-1"
          >
            <CalendarClock className="h-3 w-3" />
            {prazo} dia(s) úteis · {fmt(proximoContatoEm)}
          </Badge>
        ) : (
          <Badge variant="outline">Cadência concluída</Badge>
        )}
        {vencido && <span className="text-destructive">prazo vencido</span>}
      </div>

      <div className="flex gap-1.5">
        {podeRegistrar && prazo && (
          <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => setOpen(true)}>
            <MessageSquarePlus className="mr-1 h-3.5 w-3.5" /> Registrar contato
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setHistOpen(true)}>
          <History className="mr-1 h-3.5 w-3.5" /> Histórico
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo apontamento ({prazo} dia(s) úteis)</DialogTitle>
            <DialogDescription>
              Descreva o contato realizado. Sem apontamento até {fmt(proximoContatoEm)}, o lead vai
              automaticamente para Desistiu.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            value={texto}
            placeholder="O que foi tratado com o cliente neste contato?"
            onChange={(e) => setTexto(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={texto.trim().length < 10 || registrar.isPending}
              onClick={() => registrar.mutate()}
            >
              Salvar apontamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={histOpen} onOpenChange={setHistOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Histórico de contatos</DialogTitle>
            <DialogDescription>Registros de acompanhamento deste lead.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-auto">
            {(historico.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum contato registrado ainda.
              </p>
            ) : (
              (historico.data ?? []).map((c: any) => (
                <div key={c.id} className="rounded-lg border p-2 text-sm">
                  <div className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleString("pt-BR")} · prazo {c.prazo_dias_uteis} dia(s)
                    úteis
                  </div>
                  <div className="whitespace-pre-wrap">{c.observacao}</div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
