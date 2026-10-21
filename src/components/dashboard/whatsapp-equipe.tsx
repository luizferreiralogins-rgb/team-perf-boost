import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEquipe } from "@/components/dashboard/filtros-ranking";
import { formatarMinutos } from "@/hooks/use-tempos";
import { minutosBloqueadoNoMes, type PeriodoBloqueio } from "@/lib/whatsapp-bloqueio";

export function WhatsappEquipe({ inicioMes, proxMes }: { inicioMes: string; proxMes: string }) {
  const { data: me } = useQuery({
    queryKey: ["wa-me-role"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return null;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const roles = (data ?? []).map((r) => r.role as string);
      const role = roles.includes("lider_pap") ? "lider_pap" : roles.includes("gerente_regional") ? "gerente_regional" : "gerente";
      return { uid, role };
    },
  });
  const { data: equipe } = useEquipe(me?.uid, me?.role);
  const { data: periodos } = useQuery({
    queryKey: ["wa-bloqueio", "equipe", inicioMes],
    queryFn: async () => {
      const ini = new Date(`${inicioMes}T00:00:00`).toISOString();
      const fim = new Date(`${proxMes}T00:00:00`).toISOString();
      const { data, error } = await supabase
        .from("whatsapp_bloqueios")
        .select("user_id, inicio, fim")
        .lt("inicio", fim)
        .or(`fim.is.null,fim.gte.${ini}`);
      if (error) throw error;
      return (data ?? []) as PeriodoBloqueio[];
    },
  });
  const ini = new Date(`${inicioMes}T00:00:00`);
  const fim = new Date(`${proxMes}T00:00:00`);
  const linhas = (equipe ?? [])
    .filter((m) => m.role === "consultor")
    .map((m) => {
      const ps = (periodos ?? []).filter((p) => p.user_id === m.id);
      return { ...m, bloqueado: ps.some((p) => !p.fim), minutos: minutosBloqueadoNoMes(ps, ini, fim) };
    })
    .sort((a, b) => Number(b.bloqueado) - Number(a.bloqueado) || b.minutos - a.minutos || a.nome.localeCompare(b.nome));
  const nBloq = linhas.filter((l) => l.bloqueado).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-primary" /> WhatsApp da equipe</CardTitle>
        <CardDescription>
          {linhas.length - nBloq} ativo(s) · {nBloq} bloqueado(s) agora. Tempo bloqueado somado no mês escolhido.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {linhas.length === 0 && <p className="text-sm text-muted-foreground">Nenhum consultor na equipe.</p>}
        {linhas.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
            <span className="truncate text-sm font-medium">{l.nome}</span>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-xs text-muted-foreground">Bloqueado no mês: {formatarMinutos(l.minutos)}</span>
              <Badge variant={l.bloqueado ? "destructive" : "secondary"}>{l.bloqueado ? "Bloqueado" : "Ativo"}</Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
