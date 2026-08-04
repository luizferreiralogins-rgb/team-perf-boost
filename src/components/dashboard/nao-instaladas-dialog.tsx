import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d?: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

type Item = {
  id: string;
  canal: "loja" | "pap";
  vendedor_id: string;
  cliente: string;
  protocolo: string | null;
  produto: string;
  status: string;
  valor: number;
  data: string | null;
  agendamento: string | null;
  adiamentos: number;
};

export function NaoInstaladasDialog({
  open,
  onOpenChange,
  mesRefISO,
  escopoIds,
  uid,
  isGestor,
  canalConsultor,
  ativas,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mesRefISO: string;
  escopoIds: string[];
  uid?: string;
  isGestor: boolean;
  canalConsultor?: "loja" | "pap";
  /** Mês atual do consultor: usa as vendas ativas (não arquivadas) da aba Vendas. */
  ativas?: boolean;
}) {
  const q = useQuery({
    enabled: open,
    queryKey: ["nao-instaladas", mesRefISO, isGestor, uid, escopoIds.join(","), !!ativas],
    queryFn: async (): Promise<{ itens: Item[]; nomes: Record<string, string> }> => {
      const vazio = ["00000000-0000-0000-0000-000000000000"];
      let lojaQ = supabase
        .from("vendas_loja")
        .select("id, vendedor_id, protocolo, nome_cliente, tecnologia, status, valor_novo, data_abertura, data_agendamento, agendamento_adiamentos")
        .not("status", "in", "(instalado,cancelado)");
      let papQ = supabase
        .from("vendas_pap")
        .select("id, vendedor_id, protocolo, nome_cliente, produto, status, valor, data_venda, data_agendamento, agendamento_adiamentos")
        .not("status", "in", "(instalado,cancelado)");

      if (ativas) {
        lojaQ = lojaQ.is("arquivada_em", null);
        papQ = papQ.is("arquivada_em", null);
      } else {
        lojaQ = lojaQ.eq("mes_ref", mesRefISO);
        papQ = papQ.eq("mes_ref", mesRefISO);
      }

      if (isGestor) {
        lojaQ = lojaQ.in("vendedor_id", escopoIds.length ? escopoIds : vazio);
        papQ = papQ.in("vendedor_id", escopoIds.length ? escopoIds : vazio);
      } else {
        lojaQ = lojaQ.eq("vendedor_id", uid ?? vazio[0]);
        papQ = papQ.eq("vendedor_id", uid ?? vazio[0]);
      }

      const [loja, pap, perfis] = await Promise.all([
        lojaQ,
        papQ,
        supabase.from("profiles").select("id, nome"),
      ]);

      const itens: Item[] = [];
      if (isGestor || canalConsultor !== "pap") {
        (loja.data ?? []).forEach((v) =>
          itens.push({
            id: v.id,
            canal: "loja",
            vendedor_id: v.vendedor_id,
            cliente: v.nome_cliente,
            protocolo: v.protocolo,
            produto: v.tecnologia ?? "—",
            status: v.status,
            valor: Number(v.valor_novo ?? 0),
            data: v.data_abertura,
            agendamento: v.data_agendamento,
            adiamentos: Number(v.agendamento_adiamentos ?? 0),
          }),
        );
      }
      if (isGestor || canalConsultor !== "loja") {
        (pap.data ?? []).forEach((v) =>
          itens.push({
            id: v.id,
            canal: "pap",
            vendedor_id: v.vendedor_id,
            cliente: v.nome_cliente,
            protocolo: v.protocolo,
            produto: v.produto ?? "—",
            status: v.status,
            valor: Number(v.valor ?? 0),
            data: v.data_venda,
            agendamento: v.data_agendamento,
            adiamentos: Number(v.agendamento_adiamentos ?? 0),
          }),
        );
      }

      const nomes: Record<string, string> = {};
      (perfis.data ?? []).forEach((p) => (nomes[p.id] = p.nome));

      itens.sort((a, b) => (a.data ?? "") < (b.data ?? "") ? 1 : -1);
      return { itens, nomes };
    },
  });

  const itens = q.data?.itens ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Vendas não instaladas</DialogTitle>
          <DialogDescription>
            Vendas cadastradas na competência que ainda não foram instaladas (excluindo canceladas).
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto">
          {q.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : itens.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma venda pendente de instalação no período.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Protocolo</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Agendamento</TableHead>
                  <TableHead className="text-right">Adiamentos</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((i) => (
                  <TableRow key={`${i.canal}-${i.id}`}>
                    <TableCell className="font-medium">
                      {q.data?.nomes[i.vendedor_id] ?? "—"}
                    </TableCell>
                    <TableCell>{i.cliente}</TableCell>
                    <TableCell>{i.protocolo ?? "—"}</TableCell>
                    <TableCell>{i.produto}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{i.canal === "pap" ? "PAP" : "Loja"}</Badge>
                    </TableCell>
                    <TableCell className="capitalize">{i.status.replace("_", " ")}</TableCell>
                    <TableCell>{fmtDate(i.data)}</TableCell>
                    <TableCell
                      className={
                        i.agendamento && i.agendamento < new Date().toISOString().slice(0, 10)
                          ? "font-medium text-destructive"
                          : undefined
                      }
                    >
                      {fmtDate(i.agendamento)}
                    </TableCell>
                    <TableCell className="text-right">{i.adiamentos}</TableCell>
                    <TableCell className="text-right">{brl(i.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
