import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  useEquipe,
  aplicarFiltros,
  mesAtual,
  FiltrosBar,
  type Filtros,
} from "@/components/dashboard/filtros-ranking";
import {
  useOrdenacao,
  cmpTexto,
  cmpNumeroDesc,
  cmpDataDesc,
  type OpcaoOrdenacao,
} from "@/components/ordenacao";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

type Linha = {
  id: string;
  canal: "loja" | "pap";
  vendedor: string;
  data: string;
  protocolo: string | null;
  cliente: string;
  data_agendamento: string | null;
  tipo_protocolo: string | null;
  qtd_linhas: number;
  data_instalacao: string | null;
  valor: number;
  comissao: number;
  status: string;
};

function fimDoMes(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y!, m!, 0);
  return `${mes}-${String(d.getDate()).padStart(2, "0")}`;
}

const dataBR = (s: string | null) =>
  s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—";

export function VendasGestor() {
  const [uid, setUid] = useState<string>();
  const [role, setRole] = useState<string>();
  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getUser();
      const id = sess.user?.id;
      setUid(id);
      if (!id) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", id);
      const list = (roles ?? []).map((r) => r.role as string);
      setRole(
        list.find((r) => ["admin", "regional", "gerente_regional", "gerente", "lider_pap"].includes(r)) ??
          "consultor",
      );
    })();
  }, []);

  const [filtros, setFiltros] = useState<Filtros>({ mes: mesAtual(), pessoa: "all", unidade: "all" });
  const equipe = useEquipe(uid, role);
  const membros = useMemo(
    () => aplicarFiltros(equipe.data ?? [], filtros, role ?? ""),
    [equipe.data, filtros, role],
  );
  const consultoresIds = useMemo(() => membros.map((m) => m.id), [membros]);
  const nomePorId = useMemo(
    () => new Map((equipe.data ?? []).map((m) => [m.id, m.nome])),
    [equipe.data],
  );

  const vendas = useQuery({
    queryKey: ["vendas-gestor", filtros.mes, consultoresIds.join(",")],
    enabled: consultoresIds.length > 0,
    queryFn: async (): Promise<Linha[]> => {
      const de = `${filtros.mes}-01`;
      const ate = fimDoMes(filtros.mes);
      const [{ data: loja }, { data: pap }] = await Promise.all([
        supabase
          .from("vendas_loja")
          .select(
            "id, protocolo, vendedor_id, nome_cliente, valor_novo, status, data_abertura, data_ativacao, data_agendamento, comissao, classe_protocolo, qtd_linhas",
          )
          .in("vendedor_id", consultoresIds)
          .gte("data_abertura", de)
          .lte("data_abertura", ate),
        supabase
          .from("vendas_pap")
          .select(
            "id, protocolo, vendedor_id, nome_cliente, valor, status, data_venda, data_ativacao, data_agendamento, comissao, tipo_protocolo, qtd_linhas",
          )
          .in("vendedor_id", consultoresIds)
          .gte("data_venda", de)
          .lte("data_venda", ate),
      ]);
      const rows: Linha[] = [
        ...(loja ?? []).map((v) => ({
          id: v.id,
          canal: "loja" as const,
          vendedor: nomePorId.get(v.vendedor_id) ?? "—",
          data: v.data_abertura ?? "",
          protocolo: v.protocolo ?? null,
          cliente: v.nome_cliente,
          data_agendamento: v.data_agendamento ?? null,
          tipo_protocolo: v.classe_protocolo ?? null,
          qtd_linhas: Number(v.qtd_linhas ?? 0),
          data_instalacao: v.data_ativacao ?? null,
          valor: Number(v.valor_novo ?? 0),
          comissao: Number(v.comissao ?? 0),
          status: v.status,
        })),
        ...(pap ?? []).map((v) => ({
          id: v.id,
          canal: "pap" as const,
          vendedor: nomePorId.get(v.vendedor_id) ?? "—",
          data: v.data_venda,
          protocolo: v.protocolo ?? null,
          cliente: v.nome_cliente,
          data_agendamento: v.data_agendamento ?? null,
          tipo_protocolo: v.tipo_protocolo ?? null,
          qtd_linhas: Number(v.qtd_linhas ?? 0),
          data_instalacao: v.data_ativacao ?? null,
          valor: Number(v.valor ?? 0),
          comissao: Number(v.comissao ?? 0),
          status: v.status,
        })),
      ];
      return rows;
    },
  });

  const opcoesOrdem = useMemo<OpcaoOrdenacao<Linha>[]>(
    () => [
      { valor: "data", label: "Data (mais recente)", cmp: cmpDataDesc((r) => r.data) },
      { valor: "vendedor", label: "Vendedor (A-Z)", cmp: cmpTexto((r) => r.vendedor) },
      { valor: "cliente", label: "Cliente (A-Z)", cmp: cmpTexto((r) => r.cliente) },
      { valor: "valor", label: "Valor (maior)", cmp: cmpNumeroDesc((r) => r.valor) },
      { valor: "comissao", label: "Comissão (maior)", cmp: cmpNumeroDesc((r) => r.comissao) },
    ],
    [],
  );
  const { rows: linhas, control: ordenarControl } = useOrdenacao(vendas.data ?? [], opcoesOrdem);

  const totais = useMemo(() => {
    const valor = linhas.reduce((s, r) => s + r.valor, 0);
    const comissao = linhas.reduce((s, r) => s + r.comissao, 0);
    return { valor, comissao, qtd: linhas.length };
  }, [linhas]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Vendas do time</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Relação de vendas dos seus vendedores — filtre por vendedor, setor e período.
        </p>
      </div>

      <FiltrosBar role={role ?? ""} membros={equipe.data ?? []} filtros={filtros} onChange={setFiltros} />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle>
            {totais.qtd} venda(s) · {brl(totais.valor)} · comissão {brl(totais.comissao)}
          </CardTitle>
          {linhas.length > 0 && ordenarControl}
        </CardHeader>
        <CardContent>
          {equipe.isLoading || vendas.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : linhas.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              Nenhuma venda encontrada para os filtros selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Protocolo</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Data do agendamento</TableHead>
                    <TableHead>Tipo de protocolo</TableHead>
                    <TableHead className="text-center">Qtd linhas</TableHead>
                    <TableHead>Data instalação</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Comissão</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((v) => (
                    <TableRow key={`${v.canal}-${v.id}`}>
                      <TableCell className="whitespace-nowrap">{v.protocolo || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{dataBR(v.data || null)}</TableCell>
                      <TableCell className="whitespace-nowrap">{v.vendedor}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{v.canal === "pap" ? "PAP" : "Loja"}</Badge>
                      </TableCell>
                      <TableCell>{v.cliente}</TableCell>
                      <TableCell className="whitespace-nowrap">{dataBR(v.data_agendamento)}</TableCell>
                      <TableCell>{v.tipo_protocolo || "—"}</TableCell>
                      <TableCell className="text-center">{v.qtd_linhas || 0}</TableCell>
                      <TableCell className="whitespace-nowrap">{dataBR(v.data_instalacao)}</TableCell>
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
