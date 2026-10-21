import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function PerguntaWhatsappBloqueado({ uid }: { uid?: string }) {
  const qc = useQueryClient();
  const { data: aberto } = useQuery({
    queryKey: ["wa-bloqueio", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_bloqueios")
        .select("id, inicio")
        .eq("user_id", uid!)
        .is("fim", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const bloqueado = !!aberto;
  const m = useMutation({
    mutationFn: async (sim: boolean) => {
      if (sim && !bloqueado) {
        const { error } = await supabase.from("whatsapp_bloqueios").insert({ user_id: uid! });
        if (error) throw error;
      } else if (!sim && aberto) {
        const { error } = await supabase
          .from("whatsapp_bloqueios")
          .update({ fim: new Date().toISOString() })
          .eq("id", aberto.id);
        if (error) throw error;
      }
    },
    onSuccess: (_, sim) => {
      toast.success(sim ? "WhatsApp marcado como bloqueado." : "WhatsApp marcado como ativo.");
      qc.invalidateQueries({ queryKey: ["wa-bloqueio"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar."),
  });
  if (!uid) return null;
  return (
    <div className="mb-2 inline-flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2">
      <MessageCircle className="h-4 w-4 text-primary" />
      <span className="text-sm font-medium">Seu WhatsApp está bloqueado?</span>
      <div className="flex gap-1">
        <Button size="sm" variant={bloqueado ? "destructive" : "outline"} disabled={m.isPending} onClick={() => m.mutate(true)}>
          Sim
        </Button>
        <Button size="sm" variant={!bloqueado ? "default" : "outline"} disabled={m.isPending} onClick={() => m.mutate(false)}>
          Não
        </Button>
      </div>
    </div>
  );
}
