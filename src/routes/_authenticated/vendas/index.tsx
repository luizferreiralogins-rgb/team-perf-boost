import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useFaixaAtual } from "@/lib/faixa-atual";

import { toast } from "sonner";
import { Archive, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useOrdenacao,
  cmpTexto,
  cmpNumeroDesc,
  cmpDataDesc,
  type OpcaoOrdenacao,
} from "@/components/ordenacao";

export const Route = createFileRoute("/_authenticated/vendas/")({
  head: () => ({
    meta: [
      { title: "Vendas — Unifique Comercial" },
      { name: "description", content: "Histórico e gestão das suas vendas Unifique." },
    ],
  }),
  beforeLoad: async () => {
    const { redirect } = await import("@tanstack/react-router");
    const { data: sess } = await supabase.auth.getUser();
    const uid = sess.user?.id;
    if (!uid) return;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    const list = (roles ?? []).map((r) => r.role);
    const isGestor = list.some((r) => ["gerente", "lider_pap", "regional", "admin"].includes(r));
    if (isGestor) throw redirect({ to: "/dashboard" });
  },
  component: VendasList,
});

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  instalado: "default",
  pendente: "secondary",
  em_analise: "outline",
  cancelado: "destructive",
};

const statusLabel: Record<string, string> = {
  instalado: "Instalado",
  pendente: "Pendente",
  em_analise: "Em análise",
  cancelado: "Cancelado",
};

type Row = {
  id: string;
  data: string;
  cliente: string;
  valor: number;
  status: string;
  comissao: number;
  data_instalacao: string | null;
  data_agendamento: string | null;
};

function VendasList() {
  const qc = useQueryClient();
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [arquivando, setArquivando] = useState(false);
  const [confirmArquivar, setConfirmArquivar] = useState(false);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [uid, setUid] = useState<string>();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id));
  }, []);
  const faixa = useFaixaAtual(uid);





  const { data, isLoading } = useQuery({
    queryKey: ["vendas-list"],
    queryFn: async (): Promise<{ canal: "loja" | "pap"; rows: Row[] }> => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user!.id;
      const { data: profile } = await supabase
        .from("profiles")
        .select("canal")
        .eq("id", uid)
        .maybeSingle();
      const canal = (profile?.canal ?? "loja") as "loja" | "pap";
      if (canal === "loja") {
        const { data: rows } = await supabase
          .from("vendas_loja")
          .select("id, nome_cliente, valor_novo, status, data_abertura, data_ativacao, data_agendamento, comissao")
          .eq("vendedor_id", uid)
          .is("arquivada_em", null)
          .order("data_abertura", { ascending: false, nullsFirst: false })
          .limit(100);
        return {
          canal,
          rows: (rows ?? []).map((v) => ({
            id: v.id,
            data: v.data_abertura ?? "",
            cliente: v.nome_cliente,
            valor: Number(v.valor_novo ?? 0),
            status: v.status,
            comissao: Number(v.comissao ?? 0),
            data_instalacao: v.data_ativacao ?? null,
            data_agendamento: v.data_agendamento ?? null,
          })),
        };
      }
      const { data: rows } = await supabase
        .from("vendas_pap")
        .select("id, nome_cliente, valor, status, data_venda, data_ativacao, data_agendamento, comissao")
        .eq("vendedor_id", uid)
        .is("arquivada_em", null)
        .order("data_venda", { ascending: false })
        .limit(100);
      return {
        canal,
        rows: (rows ?? []).map((v) => ({
          id: v.id,
          data: v.data_venda,
          cliente: v.nome_cliente,
          valor: Number(v.valor ?? 0),
          status: v.status,
          comissao: Number(v.comissao ?? 0),
          data_instalacao: v.data_ativacao ?? null,
          data_agendamento: v.data_agendamento ?? null,
        })),
      };
    },
  });

  const prontasParaHistorico = useMemo(
    () => (data?.rows ?? []).filter((r) => r.status === "instalado" && !!r.data_instalacao),
    [data],
  );

  const idsElegiveis = useMemo(
    () => prontasParaHistorico.map((r) => r.id),
    [prontasParaHistorico],
  );

  // mantém a seleção sempre dentro das vendas elegíveis
  useEffect(() => {
    setSelecionadas((prev) => prev.filter((id) => idsElegiveis.includes(id)));
  }, [idsElegiveis]);

  const selecionadasRows = useMemo(
    () => prontasParaHistorico.filter((r) => selecionadas.includes(r.id)),
    [prontasParaHistorico, selecionadas],
  );

  function toggleSelecao(id: string) {
    setSelecionadas((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function enviarParaHistorico() {
    if (!data || selecionadasRows.length === 0) return;
    setArquivando(true);
    const table = data.canal === "pap" ? "vendas_pap" : "vendas_loja";
    // agrupa por mês da data de instalação — a referência do lote é sempre a instalação
    const porMes = new Map<string, string[]>();
    for (const r of selecionadasRows) {
      const mesRef = r.data_instalacao!.slice(0, 7) + "-01";
      porMes.set(mesRef, [...(porMes.get(mesRef) ?? []), r.id]);
    }
    let erro: string | null = null;
    for (const [mesRef, ids] of porMes) {
      const { error } = await supabase
        .from(table)
        .update({ mes_ref: mesRef, arquivada_em: new Date().toISOString() })
        .in("id", ids);
      if (error) erro = error.message;
    }
    setArquivando(false);
    setConfirmArquivar(false);
    if (erro) {
      toast.error("Erro ao enviar para o histórico: " + erro);
      return;
    }
    toast.success(`${selecionadasRows.length} venda(s) enviada(s) para o histórico.`);
    setSelecionadas([]);
    qc.invalidateQueries({ queryKey: ["vendas-list"] });

    qc.invalidateQueries({ queryKey: ["vendas-list"] });
    qc.invalidateQueries({ queryKey: ["historico"] });
  }


  type LinhaVenda = NonNullable<typeof data>["rows"][number];
  const opcoesOrdem = useMemo<OpcaoOrdenacao<LinhaVenda>[]>(
    () => [
      { valor: "data", label: "Data (mais recente)", cmp: cmpDataDesc((r) => r.data) },
      { valor: "cliente", label: "Cliente (A-Z)", cmp: cmpTexto((r) => r.cliente) },
      { valor: "valor", label: "Valor (maior)", cmp: cmpNumeroDesc((r) => r.valor) },
      { valor: "comissao", label: "Comissão (maior)", cmp: cmpNumeroDesc((r) => r.comissao) },
    ],
    [],
  );
  const { rows: linhas, control: ordenarControl } = useOrdenacao(data?.rows ?? [], opcoesOrdem);

  async function confirmDelete() {
    if (!toDelete || !data) return;
    setDeleting(true);
    const table = data.canal === "pap" ? "vendas_pap" : "vendas_loja";
    const { error } = await supabase.from(table).delete().eq("id", toDelete.id);
    setDeleting(false);
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
      return;
    }
    toast.success("Venda excluída.");
    setToDelete(null);
    qc.invalidateQueries({ queryKey: ["vendas-list"] });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Minhas vendas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Histórico completo do canal{" "}
            <span className="font-semibold text-foreground">
              {data?.canal === "pap" ? "PAP" : "Loja"}
            </span>
            .
          </p>
          {faixa.data && (
            <Badge variant="outline" className="mt-2 font-semibold">
              Faixa atual do mês: {faixa.data.faixa} de {faixa.data.total}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={selecionadas.length === 0 || arquivando}
            onClick={() => setConfirmArquivar(true)}
          >
            <Archive className="mr-2 h-4 w-4" /> Enviar selecionadas para Histórico
            {selecionadas.length > 0 ? ` (${selecionadas.length})` : ""}
          </Button>

          <Button asChild>
            <Link to="/vendas/nova" search={{}}>
              <Plus className="mr-2 h-4 w-4" /> Nova venda
            </Link>
          </Button>
        </div>
      </div>


      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle>Últimas 100 vendas</CardTitle>
          {(data?.rows.length ?? 0) > 0 && ordenarControl}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (data?.rows.length ?? 0) === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center">
              <p className="text-sm text-muted-foreground">Você ainda não cadastrou vendas neste canal.</p>
              <Button asChild className="mt-4">
                <Link to="/vendas/nova" search={{}}>Registrar primeira venda</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Data do agendamento</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Comissão</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="whitespace-nowrap">
                        {v.data ? new Date(v.data).toLocaleDateString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell>{v.cliente}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {v.data_agendamento
                          ? new Date(v.data_agendamento + "T00:00:00").toLocaleDateString("pt-BR")
                          : "—"}
                      </TableCell>
                      <TableCell className="font-medium">{brl(v.valor)}</TableCell>
                      <TableCell>{brl(v.comissao)}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[v.status] ?? "secondary"}>
                          {statusLabel[v.status] ?? v.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Ações</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to="/vendas/$id" params={{ id: v.id }}>
                                <Pencil className="mr-2 h-4 w-4" /> Editar
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={(e) => {
                                e.preventDefault();
                                setToDelete(v);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir venda?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. A venda de{" "}
              <span className="font-semibold">{toDelete?.cliente}</span> será removida
              e a comissão sairá dos seus indicadores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmArquivar} onOpenChange={(o) => !o && setConfirmArquivar(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar vendas instaladas para o Histórico?</AlertDialogTitle>
            <AlertDialogDescription>
              {prontasParaHistorico.length} venda(s) instalada(s) sairão desta lista e ficarão
              disponíveis na aba Histórico, agrupadas pelo mês da data de instalação. As vendas
              ainda não instaladas permanecem aqui.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={arquivando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={arquivando}
              onClick={(e) => {
                e.preventDefault();
                enviarParaHistorico();
              }}
            >
              {arquivando ? "Enviando..." : "Enviar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
