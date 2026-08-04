import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type FiltroHistorico = {
  de: string;
  ate: string;
  busca: string;
  alvos: string[] | null;
  nomePorId: Record<string, string>;
  isGestor: boolean;
};

const fmt = (d?: string | null) =>
  d ? new Date(d.length > 10 ? d : d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

const NADA = "00000000-0000-0000-0000-000000000000";

function Vazio({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
      {texto}
    </div>
  );
}

function Carregando() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function HistoricoTarefas({ de, ate, busca, alvos, nomePorId, isGestor }: FiltroHistorico) {
  const q = useQuery({
    queryKey: ["historico-tarefas", de, ate, alvos],
    queryFn: async () => {
      let query = supabase
        .from("tarefas")
        .select("id, titulo, descricao, cliente_nome, status, prioridade, data_venc, hora_venc, responsavel_id, criador_id")
        .in("status", ["concluida", "cancelada"])
        .gte("data_venc", de)
        .lte("data_venc", ate)
        .order("data_venc", { ascending: false });
      if (alvos) query = query.in("responsavel_id", alvos.length ? alvos : [NADA]);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });


  const rows = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const base = q.data ?? [];
    if (!t) return base;
    return base.filter(
      (r) =>
        r.titulo.toLowerCase().includes(t) ||
        (r.cliente_nome ?? "").toLowerCase().includes(t) ||
        (nomePorId[r.responsavel_id ?? ""] ?? "").toLowerCase().includes(t),
    );
  }, [q.data, busca, nomePorId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tarefas ({rows.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <Carregando />
        ) : rows.length === 0 ? (
          <Vazio texto="Nenhuma tarefa no período selecionado." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vencimento</TableHead>
                  {isGestor && <TableHead>Responsável</TableHead>}
                  <TableHead>Título</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      {fmt(r.data_venc)}
                      {r.hora_venc ? ` ${String(r.hora_venc).slice(0, 5)}` : ""}
                    </TableCell>
                    {isGestor && (
                      <TableCell>{nomePorId[r.responsavel_id ?? ""] ?? "—"}</TableCell>
                    )}
                    <TableCell className="max-w-[260px] truncate">{r.titulo}</TableCell>
                    <TableCell>{r.cliente_nome ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.prioridade}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "concluida" ? "default" : "outline"}>
                        {r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function HistoricoLeads({ de, ate, busca, alvos, nomePorId, isGestor }: FiltroHistorico) {
  const q = useQuery({
    queryKey: ["historico-leads", de, ate, alvos],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("id, nome, whatsapp, cidade, status, produto_interesse, created_at, updated_at, proximo_contato_em, vendedor_id")
        .gte("created_at", `${de}T00:00:00`)
        .lte("created_at", `${ate}T23:59:59`)
        .order("created_at", { ascending: false });
      if (alvos) query = query.in("vendedor_id", alvos.length ? alvos : [NADA]);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const base = q.data ?? [];
    if (!t) return base;
    return base.filter(
      (r) =>
        r.nome.toLowerCase().includes(t) ||
        (r.whatsapp ?? "").toLowerCase().includes(t) ||
        (nomePorId[r.vendedor_id] ?? "").toLowerCase().includes(t),
    );
  }, [q.data, busca, nomePorId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Leads ({rows.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <Carregando />
        ) : rows.length === 0 ? (
          <Vazio texto="Nenhum lead criado no período selecionado." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Criado em</TableHead>
                  {isGestor && <TableHead>Consultor</TableHead>}
                  <TableHead>Lead</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Interesse</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Próximo contato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{fmt(r.created_at)}</TableCell>
                    {isGestor && <TableCell>{nomePorId[r.vendedor_id] ?? "—"}</TableCell>}
                    <TableCell>{r.nome}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.whatsapp ?? "—"}</TableCell>
                    <TableCell>{r.cidade ?? "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {r.produto_interesse ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.status}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {fmt(r.proximo_contato_em)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function HistoricoProdutividade({
  de,
  ate,
  busca,
  alvos,
  nomePorId,
  isGestor,
}: FiltroHistorico) {
  const q = useQuery({
    queryKey: ["historico-produtividade", de, ate, alvos],
    queryFn: async () => {
      let query = supabase
        .from("atendimentos")
        .select("id, nome_cliente, tipo, contato_cliente, observacoes, data_atendimento, usuario_id")
        .gte("data_atendimento", de)
        .lte("data_atendimento", ate)
        .order("data_atendimento", { ascending: false });
      if (alvos) query = query.in("usuario_id", alvos.length ? alvos : [NADA]);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const base = q.data ?? [];
    if (!t) return base;
    return base.filter(
      (r) =>
        r.nome_cliente.toLowerCase().includes(t) ||
        (nomePorId[r.usuario_id] ?? "").toLowerCase().includes(t),
    );
  }, [q.data, busca, nomePorId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Atendimentos ({rows.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <Carregando />
        ) : rows.length === 0 ? (
          <Vazio texto="Nenhum atendimento no período selecionado." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  {isGestor && <TableHead>Consultor</TableHead>}
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Contato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{fmt(r.data_atendimento)}</TableCell>
                    {isGestor && <TableCell>{nomePorId[r.usuario_id] ?? "—"}</TableCell>}
                    <TableCell>{r.nome_cliente}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{String(r.tipo).replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell>{r.contato_cliente ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
