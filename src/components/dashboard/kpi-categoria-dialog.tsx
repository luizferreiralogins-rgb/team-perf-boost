import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import { isBlLoja, isBlPap, linhasMovel } from "@/lib/kpi-qtd";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d?: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

export type KpiCategoria = "bl" | "movel" | "renovacao";

const TITULO: Record<KpiCategoria, string> = {
  bl: "Banda Larga",
  movel: "Móvel",
  renovacao: "Renovações",
};

const DESCRICAO: Record<KpiCategoria, string> = {
  bl: 'Vendas de "Novo Acesso" do produto Banda Larga Fibra (01.04).',
  movel: "Vendas com linhas móveis — a quantidade do KPI soma as linhas de cada venda.",
  renovacao: "Vendas de Renovação contratual.",
};

type Item = {
  id: string;
  canal: "loja" | "pap";
  vendedor_id: string;
  cliente: string;
  protocolo: string | null;
  produto: string;
  status: string;
  qtdLinhas: number;
  valor: number;
  data: string | null;
  dataAtivacao: string | null;
};

const isMovelTec = (t?: string | null) => !!t && /m[óo]vel|movel|celular|5g|4g/i.test(t);

export function KpiCategoriaDialog({
  open,
  onOpenChange,
  categoria,
  mesesRefISO,
  escopoIds,
  uid,
  isGestor,
  canalConsultor,
  ativas,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categoria: KpiCategoria;
  mesesRefISO: string[];
  escopoIds: string[];
  uid?: string;
  isGestor: boolean;
  canalConsultor?: "loja" | "pap";
  ativas?: boolean;
}) {
  const q = useQuery({
    enabled: open && mesesRefISO.length > 0,
    queryKey: [
      "kpi-categoria",
      categoria,
      mesesRefISO.join(","),
      isGestor,
      uid,
      escopoIds.join(","),
      !!ativas,
    ],
    queryFn: async (): Promise<{ itens: Item[]; nomes: Record<string, string> }> => {
      const vazio = ["00000000-0000-0000-0000-000000000000"];
      let lojaQ = supabase
        .from("vendas_loja")
        .select(
          "id, vendedor_id, protocolo, nome_cliente, tecnologia, classe_protocolo, contem_movel, qtd_linhas, status, valor_novo, data_abertura, data_ativacao",
        );
      let papQ = supabase
        .from("vendas_pap")
        .select(
          "id, vendedor_id, protocolo, nome_cliente, produto, tecnologia, tipo_protocolo, qtd_linhas, status, valor, data_venda, data_ativacao",
        );

      if (ativas) {
        lojaQ = lojaQ.or(`arquivada_em.is.null,mes_ref.in.(${mesesRefISO.join(",")})`);
        papQ = papQ.or(`arquivada_em.is.null,mes_ref.in.(${mesRefISO.join(",")})`);
      } else {
        lojaQ = lojaQ.in("mes_ref", mesesRefISO);
        papQ = papQ.in("mes_ref", mesesRefISO);
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
        (loja.data ?? []).forEach((v) => {
          const linhas = linhasMovel(v);
          const entra =
            categoria === "bl"
              ? isBlLoja(v)
              : categoria === "movel"
                ? isMovelTec(v.tecnologia) || v.contem_movel || linhas > 0
                : (v.classe_protocolo ?? "").startsWith("Renovação");
          if (!entra) return;
          itens.push({
            id: v.id,
            canal: "loja",
            vendedor_id: v.vendedor_id,
            cliente: v.nome_cliente,
            protocolo: v.protocolo,
            produto: v.tecnologia ?? "—",
            status: v.status,
            qtdLinhas: linhas,
            valor: Number(v.valor_novo ?? 0),
            data: v.data_abertura,
            dataAtivacao: v.data_ativacao,
          });
        });
      }
      if (isGestor || canalConsultor !== "loja") {
        (pap.data ?? []).forEach((v) => {
          const linhas = linhasMovel(v);
          const desc = `${v.produto ?? ""} ${v.tecnologia ?? ""}`;
          const entra =
            categoria === "bl"
              ? isBlPap(v)
              : categoria === "movel"
                ? isMovelTec(desc) || linhas > 0
                : (v.tipo_protocolo ?? "").startsWith("Renovação");
          if (!entra) return;
          itens.push({
            id: v.id,
            canal: "pap",
            vendedor_id: v.vendedor_id,
            cliente: v.nome_cliente,
            protocolo: v.protocolo,
            produto: v.produto ?? "—",
            status: v.status,
            qtdLinhas: linhas,
            valor: Number(v.valor ?? 0),
            data: v.data_venda,
            dataAtivacao: v.data_ativacao,
          });
        });
      }

      const nomes: Record<string, string> = {};
      (perfis.data ?? []).forEach((p) => (nomes[p.id] = p.nome));

      itens.sort((a, b) => ((a.data ?? "") < (b.data ?? "") ? 1 : -1));
      return { itens, nomes };
    },
  });

  const itens = q.data?.itens ?? [];
  const totalLinhas = itens.reduce((s, i) => s + i.qtdLinhas, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>KPI {TITULO[categoria]}</DialogTitle>
          <DialogDescription>
            {DESCRICAO[categoria]}
            {categoria === "movel" && itens.length > 0
              ? ` Total de linhas: ${totalLinhas}.`
              : ""}
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
              Nenhuma venda nesta categoria no período.
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
                  {categoria === "movel" && <TableHead className="text-center">Linhas</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Ativação</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Editar</TableHead>
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
                    {categoria === "movel" && (
                      <TableCell className="text-center">{i.qtdLinhas}</TableCell>
                    )}
                    <TableCell className="capitalize">{i.status.replace("_", " ")}</TableCell>
                    <TableCell>{fmtDate(i.data)}</TableCell>
                    <TableCell>{fmtDate(i.dataAtivacao)}</TableCell>
                    <TableCell className="text-right">{brl(i.valor)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="icon" aria-label="Editar venda">
                        <Link to="/vendas/$id" params={{ id: i.id }} onClick={() => onOpenChange(false)}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
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
