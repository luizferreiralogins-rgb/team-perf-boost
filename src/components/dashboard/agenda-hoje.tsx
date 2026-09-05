import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarCheck, Check } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Tarefa = {
  id: string;
  titulo: string;
  descricao: string | null;
  cliente_nome: string | null;
  data_venc: string;
  hora_venc: string | null;
  prioridade: "baixa" | "media" | "alta";
  status: "pendente" | "iniciada" | "concluida" | "cancelada";
};

const hoje = () => new Date().toISOString().slice(0, 10);

const formatarData = (d: string) => {
  const [y, m, dia] = d.split("-");
  return `${dia}/${m}/${y}`;
};

const PRIORIDADE_LABEL = { baixa: "Baixa", media: "Média", alta: "Alta" } as const;

/** Tarefas do dia (ou as próximas) do usuário logado, com conclusão rápida. */
export function AgendaHoje({ uid }: { uid?: string }) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["agenda-hoje", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas")
        .select(
          "id, titulo, descricao, cliente_nome, data_venc, hora_venc, prioridade, status, criador_id, responsavel_id",
        )
        .in("status", ["pendente", "iniciada"])
        .or(`responsavel_id.eq.${uid},criador_id.eq.${uid}`)
        .order("data_venc", { ascending: true })
        .order("hora_venc", { ascending: true, nullsFirst: true })
        .limit(30);
      if (error) throw error;
      const hj = hoje();
      const todas = (data ?? []) as Tarefa[];
      const doDia = todas.filter((t) => t.data_venc <= hj);
      const futuras = todas.filter((t) => t.data_venc > hj);
      return { doDia, futuras: doDia.length ? futuras.slice(0, 3) : futuras.slice(0, 5) };
    },
  });

  const concluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarefas").update({ status: "concluida" }).eq("id", id);
      if (error) throw error;
      if (uid) {
        await supabase
          .from("tarefa_participantes")
          .update({ status: "concluida" })
          .eq("tarefa_id", id)
          .eq("user_id", uid);
      }
    },
    onSuccess: () => {
      toast.success("Tarefa concluída!");
      qc.invalidateQueries({ queryKey: ["agenda-hoje"] });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      qc.invalidateQueries({ queryKey: ["alertas-menu"] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const doDia = q.data?.doDia ?? [];
  const futuras = q.data?.futuras ?? [];
  const hj = hoje();

  const Item = ({ t }: { t: Tarefa }) => (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{t.titulo}</span>
          {t.prioridade === "alta" && <Badge variant="destructive">Alta</Badge>}
          {t.prioridade !== "alta" && (
            <Badge variant="secondary">{PRIORIDADE_LABEL[t.prioridade]}</Badge>
          )}
          {t.data_venc < hj && <Badge variant="outline">Em atraso</Badge>}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {formatarData(t.data_venc)}
          {t.hora_venc ? ` às ${String(t.hora_venc).slice(0, 5)}` : ""}
          {t.cliente_nome ? ` · ${t.cliente_nome}` : ""}
          {t.descricao ? ` · ${t.descricao}` : ""}
        </div>
      </div>
      <Button
        size="sm"
        onClick={() => concluir.mutate(t.id)}
        disabled={concluir.isPending}
      >
        <Check className="mr-2 h-4 w-4" /> Ok! Realizado!
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="h-4 w-4" /> Minha agenda
          </CardTitle>
          <CardDescription>
            {doDia.length ? "Tarefas de hoje e em atraso" : "Suas próximas tarefas"}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/tarefas" search={{ responsavel: undefined }}>
            Ver todas
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {q.isLoading ? (
          <>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </>
        ) : doDia.length === 0 && futuras.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma tarefa pendente. Tudo em dia!
          </p>
        ) : (
          <>
            {doDia.map((t) => (
              <Item key={t.id} t={t} />
            ))}
            {futuras.length > 0 && (
              <>
                {doDia.length > 0 && (
                  <p className="pt-2 text-xs font-medium text-muted-foreground">Próximas</p>
                )}
                {futuras.map((t) => (
                  <Item key={t.id} t={t} />
                ))}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
