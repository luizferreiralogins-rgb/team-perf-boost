import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useOrdenacao,
  cmpTexto,
  cmpNumeroDesc,
  cmpDataDesc,
  type OpcaoOrdenacao,
} from "@/components/ordenacao";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Send, Trash2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({
    meta: [
      { title: "Histórico de vendas — Unifique Comercial" },
      {
        name: "description",
        content:
          "Consulte, filtre e analise todas as vendas instaladas por data de instalação para contestações.",
      },
      { property: "og:title", content: "Histórico de vendas — Unifique Comercial" },
      {
        property: "og:description",
        content: "Vendas instaladas organizadas pela data de instalação, com filtros e análises.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoricoPage,
});

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d?: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—");

type Canal = "loja" | "pap";

type Registro = {
  id: string;
  canal: Canal;
  vendedor_id: string;
  data_instalacao: string;
  cliente: string;
  protocolo: string | null;
  tipo: string;
  produto: string;
  valor: number;
  comissao: number;
};

function firstDayOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function useMe() {
  return useQuery({
    queryKey: ["me-historico"],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user!.id;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const list = (roles ?? []).map((r) => r.role as string);
      return {
        uid,
        isGestor: list.some((r) => ["gerente", "lider_pap", "regional", "admin"].includes(r)),
        isRegional: list.some((r) => r === "regional" || r === "admin"),
      };
    },
    staleTime: 60_000,
  });
}

function HistoricoPage() {
  const meQ = useMe();
  const qc = useQueryClient();
  const isGestor = !!meQ.data?.isGestor;
  const isRegional = !!meQ.data?.isRegional;

  const [de, setDe] = useState(firstDayOfMonth());
  const [ate, setAte] = useState(todayStr());
  const [canal, setCanal] = useState<"todos" | Canal>("todos");
  const [gerente, setGerente] = useState<string>("todos");
  const [vendedor, setVendedor] = useState<string>("todos");
  const [busca, setBusca] = useState("");

  const [transferir, setTransferir] = useState<Registro | null>(null);
  const [excluir, setExcluir] = useState<Registro | null>(null);

  const pessoasQ = useQuery({
    enabled: !!meQ.data,
    queryKey: ["historico-pessoas", meQ.data?.uid],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, nome, canal, gerente_id")
        .order("nome");
      return (data ?? []) as {
        id: string;
        nome: string;
        canal: Canal;
        gerente_id: string | null;
      }[];
    },
  });

  const gerentes = useMemo(() => {
    const pessoas = pessoasQ.data ?? [];
    const ids = new Set(pessoas.map((p) => p.gerente_id).filter(Boolean) as string[]);
    return pessoas.filter((p) => ids.has(p.id));
  }, [pessoasQ.data]);

  const consultoresFiltrados = useMemo(() => {
    const pessoas = pessoasQ.data ?? [];
    if (!isRegional || gerente === "todos") return pessoas;
    // inclui toda a cadeia abaixo do gerente (gerentes subordinados e seus times)
    const ids = new Set<string>([gerente]);
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const p of pessoas) {
        if (!ids.has(p.id) && p.gerente_id && ids.has(p.gerente_id)) {
          ids.add(p.id);
          mudou = true;
        }
      }
    }
    return pessoas.filter((p) => ids.has(p.id));
  }, [pessoasQ.data, gerente, isRegional]);


  const idsDoGerente = useMemo(() => {
    if (!isRegional || gerente === "todos") return null;
    return consultoresFiltrados.map((p) => p.id);
  }, [consultoresFiltrados, gerente, isRegional]);

  const nomePorId = useMemo(() => {
    const m: Record<string, string> = {};
    (pessoasQ.data ?? []).forEach((p) => (m[p.id] = p.nome));
    return m;
  }, [pessoasQ.data]);

  const registrosQ = useQuery({
    enabled: !!meQ.data,
    queryKey: ["historico", meQ.data?.uid, de, ate, canal, vendedor, gerente, idsDoGerente],
    queryFn: async (): Promise<Registro[]> => {
      const uid = meQ.data!.uid;
      const alvo = isGestor ? (vendedor === "todos" ? null : vendedor) : uid;
      const equipe = !alvo && idsDoGerente ? idsDoGerente : null;

      const out: Registro[] = [];

      if (canal !== "pap") {
        let q = supabase
          .from("vendas_loja")
          .select(
            "id, vendedor_id, protocolo, nome_cliente, classe_protocolo, tecnologia, valor_novo, valor_antigo, comissao, data_ativacao",
          )
          .eq("status", "instalado")
          .not("data_ativacao", "is", null)
          .gte("data_ativacao", de)
          .lte("data_ativacao", ate)
          .order("data_ativacao", { ascending: false });
        if (alvo) q = q.eq("vendedor_id", alvo);
        else if (equipe) q = q.in("vendedor_id", equipe.length ? equipe : ["00000000-0000-0000-0000-000000000000"]);
        const { data, error } = await q;
        if (error) throw error;
        (data ?? []).forEach((v) =>
          out.push({
            id: v.id,
            canal: "loja",
            vendedor_id: v.vendedor_id,
            data_instalacao: v.data_ativacao as string,
            cliente: v.nome_cliente,
            protocolo: v.protocolo,
            tipo: v.classe_protocolo ?? "—",
            produto: v.tecnologia ?? "—",
            valor: Number(v.valor_novo ?? 0),
            comissao: Number(v.comissao ?? 0),
          }),
        );
      }

      if (canal !== "loja") {
        let q = supabase
          .from("vendas_pap")
          .select(
            "id, vendedor_id, protocolo, tipo_protocolo, nome_cliente, produto, valor, comissao, data_ativacao",
          )
          .eq("status", "instalado")
          .not("data_ativacao", "is", null)
          .gte("data_ativacao", de)
          .lte("data_ativacao", ate)
          .order("data_ativacao", { ascending: false });
        if (alvo) q = q.eq("vendedor_id", alvo);
        else if (equipe) q = q.in("vendedor_id", equipe.length ? equipe : ["00000000-0000-0000-0000-000000000000"]);
        const { data, error } = await q;
        if (error) throw error;
        (data ?? []).forEach((v) =>
          out.push({
            id: v.id,
            canal: "pap",
            vendedor_id: v.vendedor_id,
            data_instalacao: v.data_ativacao as string,
            cliente: v.nome_cliente,
            protocolo: v.protocolo,
            tipo: v.tipo_protocolo ?? "—",
            produto: v.produto ?? "—",
            valor: Number(v.valor ?? 0),
            comissao: Number(v.comissao ?? 0),
          }),
        );
      }

      return out.sort((a, b) => (a.data_instalacao < b.data_instalacao ? 1 : -1));
    },
  });

  const rows = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = registrosQ.data ?? [];
    if (!termo) return base;
    return base.filter(
      (r) =>
        r.cliente.toLowerCase().includes(termo) ||
        (r.protocolo ?? "").toLowerCase().includes(termo) ||
        (nomePorId[r.vendedor_id] ?? "").toLowerCase().includes(termo),
    );
  }, [registrosQ.data, busca, nomePorId]);

  type LinhaHist = (typeof rows)[number];
  const opcoesOrdem = useMemo<OpcaoOrdenacao<LinhaHist>[]>(
    () => [
      { valor: "data", label: "Instalação (recente)", cmp: cmpDataDesc((r) => r.data_instalacao) },
      { valor: "cliente", label: "Cliente (A-Z)", cmp: cmpTexto((r) => r.cliente) },
      { valor: "valor", label: "Valor (maior)", cmp: cmpNumeroDesc((r) => r.valor) },
      { valor: "comissao", label: "Comissão (maior)", cmp: cmpNumeroDesc((r) => r.comissao) },
      { valor: "consultor", label: "Consultor (A-Z)", cmp: cmpTexto((r) => nomePorId[r.vendedor_id] ?? "") },
    ],
    [nomePorId],
  );
  const { rows: linhas, control: ordenarControl } = useOrdenacao(rows, opcoesOrdem);

  const totais = useMemo(
    () => ({
      qtd: rows.length,
      receita: rows.reduce((s, r) => s + r.valor, 0),
      comissao: rows.reduce((s, r) => s + r.comissao, 0),
    }),
    [rows],
  );

  async function confirmarExclusao() {
    if (!excluir) return;
    const table = excluir.canal === "pap" ? "vendas_pap" : "vendas_loja";
    const { error } = await supabase.from(table).delete().eq("id", excluir.id);
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
      return;
    }
    toast.success("Venda excluída do histórico.");
    setExcluir(null);
    qc.invalidateQueries({ queryKey: ["historico"] });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Histórico de vendas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todas as vendas instaladas, organizadas pela <strong>data de instalação</strong>, para
          consultas e análises de contestação.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1.5">
            <Label htmlFor="de">Instalação de</Label>
            <Input id="de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ate">Instalação até</Label>
            <Input id="ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Canal</Label>
            <Select value={canal} onValueChange={(v) => setCanal(v as typeof canal)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="loja">Loja</SelectItem>
                <SelectItem value="pap">PAP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isRegional && (
            <div className="space-y-1.5">
              <Label>Gerente</Label>
              <Select
                value={gerente}
                onValueChange={(v) => {
                  setGerente(v);
                  setVendedor("todos");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os gerentes</SelectItem>
                  {gerentes.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {isGestor && (
            <div className="space-y-1.5">
              <Label>Consultor</Label>
              <Select value={vendedor} onValueChange={setVendedor}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todo o time</SelectItem>
                  {consultoresFiltrados.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="busca">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="busca"
                className="pl-8"
                placeholder="Cliente ou protocolo"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Vendas instaladas</div>
            <div className="mt-1 text-2xl font-bold">{totais.qtd}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Receita</div>
            <div className="mt-1 text-2xl font-bold">{brl(totais.receita)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Comissão</div>
            <div className="mt-1 text-2xl font-bold">{brl(totais.comissao)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Registros</CardTitle>
          {rows.length > 0 && ordenarControl}
        </CardHeader>
        <CardContent>
          {registrosQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              Nenhuma venda instalada no período selecionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Instalação</TableHead>
                    {isGestor && <TableHead>Consultor</TableHead>}
                    <TableHead>Cliente</TableHead>
                    <TableHead>Protocolo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Comissão</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((r) => (
                    <TableRow key={`${r.canal}-${r.id}`}>
                      <TableCell className="whitespace-nowrap">{fmtDate(r.data_instalacao)}</TableCell>
                      {isGestor && <TableCell>{nomePorId[r.vendedor_id] ?? "—"}</TableCell>}
                      <TableCell>{r.cliente}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.protocolo ?? "—"}</TableCell>
                      <TableCell>{r.tipo}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{r.produto}</TableCell>
                      <TableCell className="font-medium">{brl(r.valor)}</TableCell>
                      <TableCell>{brl(r.comissao)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{r.canal === "pap" ? "PAP" : "Loja"}</Badge>
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
                              <Link to="/vendas/$id" params={{ id: r.id }}>
                                <Pencil className="mr-2 h-4 w-4" /> Editar
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault();
                                setTransferir(r);
                              }}
                            >
                              <Send className="mr-2 h-4 w-4" /> Transferir
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={(e) => {
                                e.preventDefault();
                                setExcluir(r);
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

      <TransferirVendaDialog
        venda={transferir}
        onClose={() => setTransferir(null)}
        onDone={() => qc.invalidateQueries({ queryKey: ["historico"] })}
      />

      <AlertDialog open={!!excluir} onOpenChange={(o) => !o && setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir venda do histórico?</AlertDialogTitle>
            <AlertDialogDescription>
              A venda de <span className="font-semibold">{excluir?.cliente}</span> será removida
              permanentemente e sairá dos indicadores de comissão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmarExclusao();
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TransferirVendaDialog({
  venda,
  onClose,
  onDone,
}: {
  venda: Registro | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [destino, setDestino] = useState("");
  const [saving, setSaving] = useState(false);

  const destinatariosQ = useQuery({
    enabled: !!venda,
    queryKey: ["destinatarios-venda"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("listar_destinatarios_venda");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; canal: Canal }[];
    },
  });

  const opcoes = (destinatariosQ.data ?? []).filter((d) => !venda || d.canal === venda.canal);

  async function submit() {
    if (!venda || !destino) return;
    setSaving(true);
    const { error } = await supabase.rpc("transferir_venda", {
      _tabela: venda.canal === "pap" ? "vendas_pap" : "vendas_loja",
      _venda_id: venda.id,
      _para: destino,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Venda transferida.");
    setDestino("");
    onDone();
    onClose();
  }

  return (
    <Dialog open={!!venda} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir venda</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Cliente <span className="font-medium text-foreground">{venda?.cliente}</span> — canal{" "}
            {venda?.canal === "pap" ? "PAP" : "Loja"}.
          </p>
          <div className="space-y-1.5">
            <Label>Novo consultor</Label>
            <Select value={destino} onValueChange={setDestino}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o consultor" />
              </SelectTrigger>
              <SelectContent>
                {opcoes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {opcoes.length === 0 && !destinatariosQ.isLoading && (
              <p className="text-xs text-muted-foreground">
                Nenhum consultor disponível neste canal.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!destino || saving}>
            {saving ? "Transferindo..." : "Transferir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
