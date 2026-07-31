import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
};

function VendasList() {
  const qc = useQueryClient();
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);

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
          .select("id, nome_cliente, valor_novo, status, data_abertura, comissao")
          .eq("vendedor_id", uid)
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
          })),
        };
      }
      const { data: rows } = await supabase
        .from("vendas_pap")
        .select("id, nome_cliente, valor, status, data_venda, comissao")
        .eq("vendedor_id", uid)
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
        })),
      };
    },
  });

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
        </div>
        <Button asChild>
          <Link to="/vendas/nova" search={{}}>
            <Plus className="mr-2 h-4 w-4" /> Nova venda
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimas 100 vendas</CardTitle>
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
                    <TableHead>Valor</TableHead>
                    <TableHead>Comissão</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.rows.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="whitespace-nowrap">
                        {v.data ? new Date(v.data).toLocaleDateString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell>{v.cliente}</TableCell>
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
    </div>
  );
}
