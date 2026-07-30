import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type Atalho = { id: string; chave: string; nome: string; url: string | null; ordem: number };

export function useAtalhos() {
  return useQuery({
    queryKey: ["atalhos-externos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atalhos_externos")
        .select("id, chave, nome, url, ordem")
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Atalho[];
    },
    staleTime: 60_000,
  });
}

export function AtalhosExternos({ className }: { className?: string }) {
  const { data } = useAtalhos();
  const atalhos = data ?? [];
  if (!atalhos.length) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {atalhos.map((a) => {
        const disabled = !a.url;
        return (
          <a
            key={a.id}
            href={a.url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={disabled}
            title={disabled ? `${a.nome} — link não configurado` : `Abrir ${a.nome}`}
            onClick={(e) => disabled && e.preventDefault()}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground hover:shadow-md",
              disabled && "pointer-events-none opacity-40",
            )}
          >
            {a.nome}
            <ExternalLink className="h-3 w-3" />
          </a>
        );
      })}
    </div>
  );
}
