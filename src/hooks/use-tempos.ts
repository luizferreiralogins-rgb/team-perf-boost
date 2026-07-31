import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TempoParam = { chave: string; label: string; minutos: number; ordem: number };

export function useTempos() {
  return useQuery({
    queryKey: ["parametros-tempos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parametros_tempos")
        .select("chave, label, minutos, ordem")
        .order("ordem");
      if (error) throw error;
      return (data ?? []).map((t) => ({ ...t, minutos: Number(t.minutos) })) as TempoParam[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function mapaTempos(tempos?: TempoParam[]) {
  return new Map((tempos ?? []).map((t) => [t.chave, Number(t.minutos) || 0]));
}

export function formatarMinutos(min: number) {
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min`;
}
