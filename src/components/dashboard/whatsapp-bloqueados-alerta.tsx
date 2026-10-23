import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MessageCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { consultoresComBloqueio } from "@/lib/whatsapp-bloqueio";
import type { Membro } from "@/components/dashboard/filtros-ranking";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function WhatsappBloqueadosAlerta({ uid, membros }: { uid: string; membros?: Membro[] }) {
  const [aberto, setAberto] = useState(false);
  const ids = (membros ?? []).filter((m) => m.role === "consultor").map((m) => m.id).sort();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["wa-bloqueio", "ativos-equipe", uid, ids],
    enabled: membros !== undefined && ids.length > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_bloqueios")
        .select("user_id, inicio, fim").in("user_id", ids).is("fim", null);
      if (error) throw error;
      return data ?? [];
    },
  });
  const carregando = membros === undefined || (ids.length > 0 && isPending);
  const bloqueados = consultoresComBloqueio(membros ?? [], data ?? []);
  const rotulo = isError ? "Não foi possível consultar os bloqueios de WhatsApp" : carregando ? "Consultando bloqueios de WhatsApp" : `WhatsApp bloqueado: ${bloqueados.length} consultor(es)`;

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant={bloqueados.length > 0 ? "destructive" : "outline"} size="icon" aria-label={rotulo} onClick={() => setAberto(true)} className="relative shrink-0">
              {carregando ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" /> : <MessageCircle className="h-5 w-5" />}
              {!carregando && !isError && bloqueados.length > 0 && (
                <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border border-background bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">{bloqueados.length}</span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{rotulo}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[80dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>WhatsApp bloqueado</DialogTitle>
            <DialogDescription>Consultores da sua equipe com bloqueio ativo agora.</DialogDescription>
          </DialogHeader>
          {carregando ? <p className="text-sm text-muted-foreground">Consultando bloqueios…</p> : isError ? (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-destructive">Não foi possível consultar os bloqueios.</p>
              <Button variant="outline" onClick={() => void refetch()}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button>
            </div>
          ) : bloqueados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum consultor da sua equipe está com WhatsApp bloqueado.</p>
          ) : (
            <ul className="divide-y divide-border">
              {bloqueados.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0"><p className="break-words text-sm font-medium">{m.nome}</p><p className="text-xs text-muted-foreground">{m.canal === "pap" ? "PAP" : "Loja"}{m.loja_unidade ? ` · ${m.loja_unidade}` : ""}</p></div>
                  <Badge variant="destructive" className="shrink-0">Bloqueado</Badge>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}