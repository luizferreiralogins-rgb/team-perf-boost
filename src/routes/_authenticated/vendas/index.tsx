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
    const isGestor = list.some((r) => r === "gerente" || r === "regional" || r === "admin");
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
          <Link to="/vendas/nova">
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
                <Link to="/vendas/nova">Registrar primeira venda</Link>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
