import { Fragment, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  HeartHandshake,
  MessageSquare,
  Pencil,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { supabase } from "@/integrations/supabase/client";
import {
  FiltrosBar,
  aplicarFiltros,
  mesAtual,
  useEquipe,
  type Filtros,
} from "@/components/dashboard/filtros-ranking";
import {
  DialogNovosProdutos,
  DialogSatisfacao,
  ResumoProdutos,
  labelResultado,
  type VendaAlvo,
} from "@/components/pos-vendas/dialogs";
import { WhatsAppLink } from "@/components/whatsapp-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/pos-vendas")({
  head: () => ({
    meta: [
      { title: "Pós-vendas — Unifique Comercial" },
      {
        name: "description",
        content:
          "Acompanhe contatos de satisfação e ofertas de novos produtos das vendas ativadas.",
      },
      { property: "og:title", content: "Pós-vendas — Unifique Comercial" },
      {
        property: "og:description",
        content: "Régua de pós-venda: satisfação em 10 dias e oferta de novos produtos em 20 dias.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PosVendasPage,
});

type Fase = "satisfacao" | "correcao" | "produtos" | "concluido";

const FASE_LABEL: Record<string, string> = {
  satisfacao: "Satisfação",
  correcao: "Correção",
  produtos: "Novos produtos",
};

type Contato = {
  id: string;
  venda_id: string;
  fase: "satisfacao" | "produtos";
  resultado: string | null;
  motivo: string | null;
  observacao: string | null;
  produtos: unknown;
  created_at: string;
};

type Ajuste = {
  id: string;
  venda_id: string;
  fase: string | null;
  prazo: string | null;
  observacao: string | null;
  created_at: string;
  criado_por: string;
};

type Item = {
  id: string;
  tabela: "vendas_loja" | "vendas_pap";
  canal: "Loja" | "PAP";
  vendedorId: string;
  vendedor: string;
  cliente: string;
  protocolo: string | null;
  telefone: string | null;
  ativacao: string;
  fase: Fase;
  prazo: string | null;
  atrasado: boolean;
  motivoConclusao: string | null;
  contatos: Contato[];
  ajustes: Ajuste[];
};

const dataBR = (v?: string | null) =>
  v ? new Date(`${v.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR") : "—";

const dataHoraBR = (v: string) =>
  new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const hojeISO = () => new Date().toISOString().slice(0, 10);

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function rolePrincipal(roles: string[]) {
  return (
    ["admin", "regional", "gerente_regional", "gerente", "lider_pap", "consultor"].find((r) =>
      roles.includes(r),
    ) ?? "consultor"
  );
}

function PosVendasPage() {
  const [filtros, setFiltros] = useState<Filtros>({ mes: mesAtual(), pessoa: "all", unidades: [] });
  const [fase, setFase] = useState<"todas" | Fase>("todas");
  const [situacao, setSituacao] = useState<"todas" | "em_dia" | "atrasado">("todas");
  const [busca, setBusca] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [alvoSatisfacao, setAlvoSatisfacao] = useState<VendaAlvo | null>(null);
  const [alvoProdutos, setAlvoProdutos] = useState<VendaAlvo | null>(null);
  const [alvoObs, setAlvoObs] = useState<Item | null>(null);
  const qc = useQueryClient();

  const ajustar = useMutation({
    mutationFn: async ({
      item,
      fase,
      prazo,
      observacao,
    }: {
      item: Item;
      fase?: string | null;
      prazo?: string | null;
      observacao?: string | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("pos_venda_ajustes" as never).insert({
        tabela: item.tabela,
        venda_id: item.id,
        vendedor_id: item.vendedorId,
        fase: fase ?? null,
        prazo: prazo ?? null,
        observacao: observacao ?? null,
        criado_por: auth.user!.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro de pós-venda atualizado.");
      qc.invalidateQueries({ queryKey: ["pos-venda-contatos"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar."),
  });

  const me = useQuery({
    queryKey: ["me-pos-vendas"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return null;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      return { uid, role: rolePrincipal((roles ?? []).map((r) => r.role as string)) };
    },
  });

  const uid = me.data?.uid;
  const role = me.data?.role ?? "consultor";
  const isGestor = role !== "consultor";
  const equipe = useEquipe(isGestor ? uid : undefined, isGestor ? role : undefined);

  const idsVisiveis = useMemo(() => {
    if (!uid) return [];
    if (!isGestor) return [uid];
    const membros = aplicarFiltros(equipe.data ?? [], filtros, role);
    const ids = membros.map((m) => m.id);
    return filtros.pessoa === "all" && filtros.unidades.length === 0 ? [uid, ...ids] : ids;
  }, [uid, isGestor, equipe.data, filtros, role]);

  const dados = useQuery({
    queryKey: ["pos-venda-contatos", idsVisiveis],
    enabled: idsVisiveis.length > 0,
    queryFn: async () => {
      const desde = somarDias(hojeISO(), -365);
      const [loja, pap, contatos, profs, ajustesQ] = await Promise.all([
        supabase
          .from("vendas_loja")
          .select("id, vendedor_id, protocolo, nome_cliente, data_ativacao, telefone")
          .eq("status", "instalado")
          .not("data_ativacao", "is", null)
          .gte("data_ativacao", desde)
          .in("vendedor_id", idsVisiveis),
        supabase
          .from("vendas_pap")
          .select("id, vendedor_id, protocolo, nome_cliente, data_ativacao, telefone")
          .eq("status", "instalado")
          .not("data_ativacao", "is", null)
          .gte("data_ativacao", desde)
          .in("vendedor_id", idsVisiveis),
        supabase
          .from("pos_venda_contatos")
          .select("id, venda_id, fase, resultado, motivo, observacao, produtos, created_at")
          .in("vendedor_id", idsVisiveis)
          .order("created_at", { ascending: true }),
        supabase.from("profiles").select("id, nome").in("id", idsVisiveis),
        (supabase.from("pos_venda_ajustes" as never) as any)
          .select("id, venda_id, fase, prazo, observacao, created_at, criado_por")
          .in("vendedor_id", idsVisiveis)
          .order("created_at", { ascending: true }),
      ]);
      // Vendas de Loja não guardam telefone: busca o WhatsApp no lead de mesmo nome do consultor
      const { data: leadsTel } = await supabase
        .from("leads")
        .select("vendedor_id, nome, whatsapp")
        .in("vendedor_id", idsVisiveis)
        .not("whatsapp", "is", null);
      const chave = (vid: string, nome: string) => `${vid}|${(nome || "").trim().toLowerCase()}`;
      const telLead = new Map((leadsTel ?? []).map((l) => [chave(l.vendedor_id, l.nome), l.whatsapp]));

      const nomes = new Map((profs.data ?? []).map((p) => [p.id, p.nome || "—"]));
      const porVenda = new Map<string, Contato[]>();
      for (const c of (contatos.data ?? []) as Contato[]) {
        const arr = porVenda.get(c.venda_id) ?? [];
        arr.push(c);
        porVenda.set(c.venda_id, arr);
      }
      const ajPorVenda = new Map<string, Ajuste[]>();
      for (const a of (ajustesQ.data ?? []) as Ajuste[]) {
        const arr = ajPorVenda.get(a.venda_id) ?? [];
        arr.push(a);
        ajPorVenda.set(a.venda_id, arr);
      }
      const hoje = hojeISO();

      const montar = (
        v: any,
        tabela: "vendas_loja" | "vendas_pap",
        canal: "Loja" | "PAP",
      ): Item => {
        const lista = porVenda.get(v.id) ?? [];
        const ajustes = ajPorVenda.get(v.id) ?? [];
        const sat = lista.find((c) => c.fase === "satisfacao");
        const prod = lista.find((c) => c.fase === "produtos");
        let fase: Fase = "satisfacao";
        let prazo: string | null = somarDias(v.data_ativacao, 10);
        let motivoConclusao: string | null = null;
        if (sat) {
          if (sat.resultado === "satisfeito") {
            if (prod) {
              fase = "concluido";
              prazo = null;
              motivoConclusao = "Oferta registrada";
            } else {
              fase = "produtos";
              prazo = somarDias(sat.created_at, 20);
            }
          } else {
            fase = "concluido";
            prazo = null;
            motivoConclusao = `Sem oferta — ${labelResultado(sat.resultado)}`;
          }
        }
        // Ajustes manuais feitos após o último contato prevalecem
        const ultimoContato = lista.length ? lista[lista.length - 1].created_at : "";
        const recentes = ajustes.filter((a) => a.created_at > ultimoContato);
        const ajFase = [...recentes].reverse().find((a) => a.fase);
        const ajPrazo = [...recentes].reverse().find((a) => a.prazo);
        if (ajFase?.fase) {
          fase = ajFase.fase as Fase;
          motivoConclusao = null;
          if (!prazo) prazo = hoje;
        }
        if (ajPrazo?.prazo) prazo = ajPrazo.prazo;
        return {
          id: v.id,
          tabela,
          canal,
          vendedorId: v.vendedor_id,
          vendedor: nomes.get(v.vendedor_id) ?? "—",
          cliente: v.nome_cliente,
          protocolo: v.protocolo,
          telefone: v.telefone || telLead.get(chave(v.vendedor_id, v.nome_cliente)) || null,
          ativacao: v.data_ativacao,
          fase,
          prazo,
          atrasado: !!prazo && prazo < hoje,
          motivoConclusao,
          contatos: lista,
          ajustes,
        };
      };

      return [
        ...(loja.data ?? []).map((v) => montar(v, "vendas_loja", "Loja")),
        ...(pap.data ?? []).map((v) => montar(v, "vendas_pap", "PAP")),
      ].sort((a, b) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"));
    },
  });

  const itens = dados.data ?? [];

  const resumo = useMemo(
    () => ({
      satEmDia: itens.filter((i) => i.fase === "satisfacao" && !i.atrasado).length,
      satAtraso: itens.filter((i) => i.fase === "satisfacao" && i.atrasado).length,
      prodEmDia: itens.filter((i) => i.fase === "produtos" && !i.atrasado).length,
      prodAtraso: itens.filter((i) => i.fase === "produtos" && i.atrasado).length,
      concluidos: itens.filter((i) => i.fase === "concluido").length,
    }),
    [itens],
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return itens.filter((i) => {
      if (fase !== "todas" && i.fase !== fase) return false;
      if (situacao === "atrasado" && !i.atrasado) return false;
      if (situacao === "em_dia" && (i.atrasado || i.fase === "concluido")) return false;
      if (
        termo &&
        !i.cliente.toLowerCase().includes(termo) &&
        !(i.protocolo ?? "").toLowerCase().includes(termo)
      )
        return false;
      return true;
    });
  }, [itens, fase, situacao, busca]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <HeartHandshake className="h-7 w-7 text-primary" /> Pós-vendas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Contato de satisfação 10 dias após a ativação e oferta de novos produtos 20 dias depois,
          quando o cliente está satisfeito.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <CardResumo titulo="Satisfação em dia" valor={resumo.satEmDia} />
        <CardResumo titulo="Satisfação atrasada" valor={resumo.satAtraso} destaque />
        <CardResumo titulo="Novos produtos em dia" valor={resumo.prodEmDia} />
        <CardResumo titulo="Novos produtos atrasados" valor={resumo.prodAtraso} destaque />
        <CardResumo titulo="Concluídos" valor={resumo.concluidos} />
      </div>

      {isGestor && (
        <FiltrosBar
          role={role}
          membros={equipe.data ?? []}
          filtros={filtros}
          onChange={setFiltros}
        />
      )}

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Fase</Label>
            <Select value={fase} onValueChange={(v) => setFase(v as typeof fase)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="satisfacao">Satisfação</SelectItem>
                <SelectItem value="correcao">Correção</SelectItem>
                <SelectItem value="produtos">Novos produtos</SelectItem>
                <SelectItem value="concluido">Concluído</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Situação</Label>
            <Select value={situacao} onValueChange={(v) => setSituacao(v as typeof situacao)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="em_dia">Em dia</SelectItem>
                <SelectItem value="atrasado">Atrasados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Cliente ou protocolo"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vendas ativadas</CardTitle>
          <CardDescription>
            {dados.isLoading ? "Carregando..." : `${filtrados.length} venda(s) na seleção.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {dados.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtrados.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma venda encontrada para os filtros selecionados.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Protocolo</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Consultor</TableHead>
                  <TableHead>Ativação</TableHead>
                  <TableHead>Fase</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead className="text-right">Obs. / Venda</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((i) => (
                  <Fragment key={i.id}>
                    <TableRow>
                      <TableCell>
                        <button
                          onClick={() => setExpandido(expandido === i.id ? null : i.id)}
                          aria-label="Ver histórico"
                          className="grid h-6 w-6 place-items-center rounded hover:bg-accent"
                        >
                          {expandido === i.id ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell>{i.protocolo || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {i.telefone ? <WhatsAppLink numero={i.telefone} /> : "—"}
                      </TableCell>
                      <TableCell className="font-medium">{i.cliente}</TableCell>
                      <TableCell>{i.canal}</TableCell>
                      <TableCell>{i.vendedor}</TableCell>
                      <TableCell>{dataBR(i.ativacao)}</TableCell>
                      <TableCell>
                        <Select
                          value={i.fase}
                          onValueChange={(v) => v !== i.fase && ajustar.mutate({ item: i, fase: v })}
                        >
                          <SelectTrigger className="h-8 w-40 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="satisfacao">Satisfação</SelectItem>
                            <SelectItem value="correcao">Correção</SelectItem>
                            <SelectItem value="produtos">Novos produtos</SelectItem>
                            {i.fase === "concluido" && (
                              <SelectItem value="concluido" disabled>
                                {i.motivoConclusao ?? "Concluído"}
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          defaultValue={i.prazo ?? ""}
                          key={`${i.id}-${i.prazo}`}
                          className={`h-8 w-36 text-xs ${i.atrasado ? "font-medium text-destructive" : ""}`}
                          onBlur={(e) => {
                            const v = e.target.value;
                            if (v && v !== i.prazo) ajustar.mutate({ item: i, prazo: v });
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value=""
                          onValueChange={(v) => {
                            const alvo: VendaAlvo = {
                              id: i.id,
                              tabela: i.tabela,
                              vendedorId: i.vendedorId,
                              cliente: i.cliente,
                            };
                            if (v === "satisfacao") setAlvoSatisfacao(alvo);
                            else setAlvoProdutos(alvo);
                          }}
                        >
                          <SelectTrigger className="h-8 w-44 text-xs">
                            <SelectValue placeholder="Registrar contato" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="satisfacao">Contato de satisfação</SelectItem>
                            <SelectItem value="produtos">Oferta de novos produtos</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="relative h-8 w-8"
                            title="Observação"
                            aria-label="Observação"
                            onClick={() => setAlvoObs(i)}
                          >
                            <MessageSquare className="h-4 w-4" />
                            {i.ajustes.some((a) => a.observacao) && (
                              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" />
                            )}
                          </Button>
                          <Button
                            asChild
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title="Abrir cadastro da venda"
                          >
                            <Link to="/vendas/$id" params={{ id: i.id }} aria-label="Editar venda">
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandido === i.id && (
                      <TableRow>
                        <TableCell colSpan={11} className="bg-muted/40">
                          <Historico item={i} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DialogSatisfacao
        venda={alvoSatisfacao}
        open={!!alvoSatisfacao}
        onOpenChange={(v) => !v && setAlvoSatisfacao(null)}
      />
      <DialogNovosProdutos
        venda={alvoProdutos}
        open={!!alvoProdutos}
        onOpenChange={(v) => !v && setAlvoProdutos(null)}
      />
      <DialogObservacao
        item={alvoObs ? (itens.find((x) => x.id === alvoObs.id) ?? alvoObs) : null}
        salvando={ajustar.isPending}
        onClose={() => setAlvoObs(null)}
        onSalvar={(texto) =>
          alvoObs && ajustar.mutateAsync({ item: alvoObs, observacao: texto })
        }
      />
    </div>
  );
}

function Historico({ item }: { item: Item }) {
  const eventos = [
    ...item.contatos.map((c) => ({ tipo: "contato" as const, at: c.created_at, c })),
    ...item.ajustes.map((a) => ({ tipo: "ajuste" as const, at: a.created_at, a })),
  ].sort((x, y) => y.at.localeCompare(x.at));
  if (eventos.length === 0)
    return <p className="py-2 text-sm text-muted-foreground">Nenhum registro ainda.</p>;
  return (
    <div className="max-h-96 space-y-2 overflow-auto py-2">
      {eventos.map((e) =>
        e.tipo === "contato" ? (
          <div key={e.c.id} className="rounded-lg border bg-background p-2 text-sm">
            <div className="text-xs text-muted-foreground">
              {dataHoraBR(e.at)} · Contato de {FASE_LABEL[e.c.fase]}
            </div>
            {e.c.fase === "satisfacao" ? (
              <div>
                Resultado: <strong>{labelResultado(e.c.resultado)}</strong>
                {e.c.motivo ? ` — ${e.c.motivo}` : ""}
              </div>
            ) : (
              <ResumoProdutos produtos={e.c.produtos} />
            )}
            {e.c.observacao && (
              <div className="whitespace-pre-wrap text-muted-foreground">{e.c.observacao}</div>
            )}
          </div>
        ) : (
          <div key={e.a.id} className="rounded-lg border bg-background p-2 text-sm">
            <div className="text-xs text-muted-foreground">{dataHoraBR(e.at)}</div>
            {e.a.fase && (
              <div>
                Fase alterada para <strong>{FASE_LABEL[e.a.fase] ?? e.a.fase}</strong>
              </div>
            )}
            {e.a.prazo && (
              <div>
                Próximo contato em <strong>{dataBR(e.a.prazo)}</strong>
              </div>
            )}
            {e.a.observacao && (
              <div className="flex gap-1.5 whitespace-pre-wrap">
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                {e.a.observacao}
              </div>
            )}
          </div>
        ),
      )}
    </div>
  );
}

function DialogObservacao({
  item,
  salvando,
  onClose,
  onSalvar,
}: {
  item: Item | null;
  salvando: boolean;
  onClose: () => void;
  onSalvar: (texto: string) => Promise<unknown> | null;
}) {
  const [texto, setTexto] = useState("");
  return (
    <Dialog
      open={!!item}
      onOpenChange={(v) => {
        if (!v) {
          setTexto("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Observações</DialogTitle>
          <DialogDescription>
            {item?.cliente} {item?.protocolo ? `· Protocolo ${item.protocolo}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Textarea
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva uma observação sobre este pós-venda"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!texto.trim() || salvando}
              onClick={async () => {
                await onSalvar(texto.trim());
                setTexto("");
              }}
            >
              Adicionar observação
            </Button>
          </div>
        </div>
        <div>
          <div className="mb-1 text-sm font-medium">Histórico</div>
          {item && <Historico item={item} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setTexto(""); onClose(); }}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CardResumo({
  titulo,
  valor,
  destaque,
}: {
  titulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{titulo}</div>
        <div
          className={`text-2xl font-bold ${destaque && valor > 0 ? "text-destructive" : ""}`}
        >
          {valor}
        </div>
      </CardContent>
    </Card>
  );
}
