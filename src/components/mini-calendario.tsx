import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type T = { id: string; titulo: string; data_venc: string; hora_venc: string | null; status: string };

/** Mini calendário do menu lateral com os dias que têm tarefas. */
export function MiniCalendario() {
  const hoje = new Date();
  const hojeIso = iso(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const [ref, setRef] = useState({ y: hoje.getFullYear(), m: hoje.getMonth() });
  const [aberto, setAberto] = useState<string | null>(null);

  const ultimo = new Date(ref.y, ref.m + 1, 0).getDate();
  const inicio = iso(ref.y, ref.m, 1);
  const fim = iso(ref.y, ref.m, ultimo);

  const q = useQuery({
    queryKey: ["tarefas", "mini-cal", inicio],
    staleTime: 30_000,
    queryFn: async () => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) return [] as T[];
      const [{ data: part }] = await Promise.all([
        supabase.from("tarefa_participantes").select("tarefa_id").eq("user_id", uid),
      ]);
      const ids = (part ?? []).map((p) => p.tarefa_id);
      const filtros = [`criador_id.eq.${uid}`, `responsavel_id.eq.${uid}`];
      if (ids.length) filtros.push(`id.in.(${ids.slice(0, 200).join(",")})`);
      const { data, error } = await supabase
        .from("tarefas")
        .select("id, titulo, data_venc, hora_venc, status")
        .neq("status", "cancelada")
        .gte("data_venc", inicio)
        .lte("data_venc", fim)
        .or(filtros.join(","))
        .order("hora_venc", { ascending: true, nullsFirst: true });
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });

  const porDia = useMemo(() => {
    const m = new Map<string, T[]>();
    for (const t of q.data ?? []) m.set(t.data_venc, [...(m.get(t.data_venc) ?? []), t]);
    return m;
  }, [q.data]);

  const offset = new Date(ref.y, ref.m, 1).getDay();
  const celulas: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: ultimo }, (_, i) => i + 1)];

  const mover = (d: number) =>
    setRef((r) => {
      const n = new Date(r.y, r.m + d, 1);
      return { y: n.getFullYear(), m: n.getMonth() };
    });

  return (
    <div className="px-3 py-2">
      <div className="mb-1 flex items-center justify-between">
        <button onClick={() => mover(-1)} className="grid h-6 w-6 place-items-center rounded hover:bg-sidebar-accent" aria-label="Mês anterior">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => setRef({ y: hoje.getFullYear(), m: hoje.getMonth() })}
          className="text-xs font-semibold hover:underline"
          title="Voltar ao mês atual"
        >
          {MESES[ref.m]} {ref.y}
        </button>
        <button onClick={() => mover(1)} className="grid h-6 w-6 place-items-center rounded hover:bg-sidebar-accent" aria-label="Próximo mês">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] text-sidebar-foreground/60">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center text-[11px]">
        {celulas.map((d, i) => {
          if (!d) return <div key={i} />;
          const dia = iso(ref.y, ref.m, d);
          const tarefas = porDia.get(dia) ?? [];
          return (
            <Popover key={i} open={aberto === dia} onOpenChange={(o) => setAberto(o ? dia : null)}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "mx-auto grid h-6 w-6 place-items-center rounded-full hover:bg-sidebar-accent",
                    tarefas.length > 0 && "ring-2 ring-sidebar-primary font-semibold",
                    dia === hojeIso && "bg-sidebar-primary text-sidebar-primary-foreground",
                  )}
                  aria-label={`${d} de ${MESES[ref.m]}${tarefas.length ? `, ${tarefas.length} tarefa(s)` : ""}`}
                >
                  {d}
                </button>
              </PopoverTrigger>
              <PopoverContent side="right" align="end" className="w-64 p-3">
                <div className="mb-2 text-sm font-semibold">
                  {pad(d)}/{pad(ref.m + 1)}/{ref.y}
                </div>
                {tarefas.length === 0 ? (
                  <p className="mb-2 text-xs text-muted-foreground">Nenhuma tarefa neste dia.</p>
                ) : (
                  <ul className="mb-2 max-h-48 space-y-1 overflow-auto">
                    {tarefas.map((t) => (
                      <li key={t.id} className="rounded border border-border px-2 py-1 text-xs">
                        <span className={cn(t.status === "concluida" && "line-through text-muted-foreground")}>
                          {t.hora_venc ? `${t.hora_venc.slice(0, 5)} · ` : ""}
                          {t.titulo}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="outline" className="flex-1" onClick={() => setAberto(null)}>
                    <Link to="/tarefas" search={{ responsavel: undefined }}>Ver agenda</Link>
                  </Button>
                  <Button asChild size="sm" className="flex-1" onClick={() => setAberto(null)}>
                    <Link to="/tarefas" search={{ responsavel: undefined, data: dia }}>
                      <Plus className="mr-1 h-3 w-3" /> Criar
                    </Link>
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
  );
}
