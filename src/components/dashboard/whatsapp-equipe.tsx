import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEquipe } from "@/components/dashboard/filtros-ranking";
import { formatarMinutos } from "@/hooks/use-tempos";
import { minutosBloqueadoNoMes, type PeriodoBloqueio } from "@/lib/whatsapp-bloqueio";

export function WhatsappEquipe({ inicioMes: mesPadrao }: { inicioMes: string; proxMes: string }) {
  const [mesEscolhido, setMesEscolhido] = useState<string | null>(null);
  const mes = mesEscolhido ?? mesPadrao.slice(0, 7);
  const inicioMes = `${mes}-01`;
  const [ano, numeroMes] = mes.split("-").map(Number);
  const seguinte = new Date(ano, numeroMes, 1);
  const proxMes = `${seguinte.getFullYear()}-${String(seguinte.getMonth() + 1).padStart(2, "0")}-01`;
  const mudarMes = (delta: number) => {
    const destino = new Date(ano, numeroMes - 1 + delta, 1);
    setMesEscolhido(`${destino.getFullYear()}-${String(destino.getMonth() + 1).padStart(2, "0")}`);
  };
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
  const { data: periodos, isPending, isError } = useQuery({
    queryKey: ["wa-bloqueio", "equipe", me?.uid, inicioMes],
    enabled: !!me?.uid,
    queryFn: async () => {
      const ini = new Date(`${inicioMes}T00:00:00`).toISOString();
      const fim = new Date(`${proxMes}T00:00:00`).toISOString();
      const { data, error } = await supabase
        .from("whatsapp_bloqueios")
        .select("user_id, inicio, fim")
        .or(`fim.is.null,and(inicio.lt.${fim},fim.gte.${ini})`);
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-primary" /> WhatsApp da equipe</CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Mês anterior do WhatsApp" onClick={() => mudarMes(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Input type="month" aria-label="Mês dos bloqueios de WhatsApp" value={mes} onChange={(e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) setMesEscolhido(e.target.value); }} className="w-44" />
            <Button variant="ghost" size="icon" aria-label="Próximo mês do WhatsApp" onClick={() => mudarMes(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        <CardDescription>
          {linhas.length - nBloq} ativo(s) · {nBloq} bloqueado(s) agora. Tempo bloqueado somado no mês escolhido.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isPending ? <p className="text-sm text-muted-foreground">Consultando bloqueios…</p> : isError ? <p role="alert" className="text-sm text-destructive">Não foi possível consultar os bloqueios deste mês.</p> : linhas.length === 0 && <p className="text-sm text-muted-foreground">Nenhum consultor na equipe.</p>}
        {!isPending && !isError && linhas.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
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
