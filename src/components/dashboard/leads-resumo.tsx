import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, AlarmClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WhatsAppLink } from "@/components/whatsapp-link";
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

const STATUS_ATIVOS = ["contato_feito", "negociando"] as const;
const PRAZOS = [1, 5, 15, 30];

const fmtDate = (d?: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

type LeadRow = {
  id: string;
  vendedor_id: string;
  nome: string;
  cidade: string | null;
  whatsapp: string | null;
  produto_interesse: string | null;
  status: string;
  etapa_contato: number | null;
  proximo_contato_em: string | null;
};

export function LeadsResumo({
  isGestor,
  uid,
  escopoIds,
}: {
  isGestor: boolean;
  uid?: string;
  escopoIds: string[];
}) {
  const [aberto, setAberto] = useState(false);
  const hoje = new Date().toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    enabled: isGestor ? true : !!uid,
    queryKey: ["dashboard-leads", isGestor, uid, escopoIds.join(",")],
    queryFn: async () => {
      const vazio = "00000000-0000-0000-0000-000000000000";
      let q = supabase
        .from("leads")
        .select(
          "id, vendedor_id, nome, cidade, whatsapp, produto_interesse, status, etapa_contato, proximo_contato_em",
        )
        .in("status", [...STATUS_ATIVOS]);
      q = isGestor
        ? q.in("vendedor_id", escopoIds.length ? escopoIds : [vazio])
        : q.eq("vendedor_id", uid ?? vazio);

      const [leads, perfis] = await Promise.all([
        q,
        supabase.from("profiles").select("id, nome"),
      ]);

      const rows = (leads.data ?? []) as LeadRow[];
      const vencidos = rows
        .filter((l) => !!l.proximo_contato_em && l.proximo_contato_em! < hoje)
        .sort((a, b) => (a.proximo_contato_em! < b.proximo_contato_em! ? -1 : 1));
      const hojeList = rows.filter((l) => l.proximo_contato_em === hoje);

      const nomes: Record<string, string> = {};
      (perfis.data ?? []).forEach((p) => (nomes[p.id] = p.nome));

      return { total: rows.length, vencidos, hoje: hojeList.length, nomes };
    },
  });

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Gestão de Leads
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        <MiniCard
          title="Leads em andamento"
          value={isLoading ? null : String(data?.total ?? 0)}
          icon={Users}
        />
        <MiniCard
          title="Contatos vencidos"
          value={isLoading ? null : String(data?.vencidos.length ?? 0)}
          icon={AlarmClock}
          destaque={(data?.vencidos.length ?? 0) > 0}
          onClick={() => setAberto(true)}
        />
        <MiniCard
          title="Contatos para hoje"
          value={isLoading ? null : String(data?.hoje ?? 0)}
          icon={AlarmClock}
        />
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Leads com contato vencido</DialogTitle>
            <DialogDescription>
              Leads que ultrapassaram o prazo da cadência obrigatória de contato.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (data?.vencidos.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum lead com contato vencido.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Consultor</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Interesse</TableHead>
                    <TableHead>Etapa</TableHead>
                    <TableHead>Prazo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.vencidos.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">
                        {data!.nomes[l.vendedor_id] ?? "—"}
                      </TableCell>
                      <TableCell>{l.nome}</TableCell>
                      <TableCell>{l.cidade ?? "—"}</TableCell>
                      <TableCell>
                        <WhatsAppLink numero={l.whatsapp} />
                      </TableCell>
                      <TableCell>{l.produto_interesse ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {PRAZOS[l.etapa_contato ?? 0] ?? 30} dias úteis
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-destructive">
                        {fmtDate(l.proximo_contato_em)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniCard({
  title,
  value,
  icon: Icon,
  onClick,
  destaque,
}: {
  title: string;
  value: string | null;
  icon: React.ElementType;
  onClick?: () => void;
  destaque?: boolean;
}) {
  return (
    <Card
      onClick={onClick}
      className={onClick ? "cursor-pointer transition-colors hover:bg-accent/50" : undefined}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${destaque ? "text-destructive" : "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent>
        {value === null ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className={`text-2xl font-bold ${destaque ? "text-destructive" : ""}`}>{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
