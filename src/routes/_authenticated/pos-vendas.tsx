import { Fragment, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ChevronDown, ChevronRight, HeartHandshake, Search } from "lucide-react";

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

type Fase = "satisfacao" | "produtos" | "concluido";

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

type Item = {
  id: string;
  tabela: "vendas_loja" | "vendas_pap";
  canal: "Loja" | "PAP";
  vendedorId: string;
  vendedor: string;
  cliente: string;
  protocolo: string | null;
  ativacao: string;
  fase: Fase;
  prazo: string | null;
  atrasado: boolean;
  motivoConclusao: string | null;
  contatos: Contato[];
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
      const [loja, pap, contatos, profs] = await Promise.all([
        supabase
          .from("vendas_loja")
          .select("id, vendedor_id, protocolo, nome_cliente, data_ativacao")
          .eq("status", "instalado")
          .not("data_ativacao", "is", null)
          .gte("data_ativacao", desde)
          .in("vendedor_id", idsVisiveis),
        supabase
          .from("vendas_pap")
          .select("id, vendedor_id, protocolo, nome_cliente, data_ativacao")
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
      ]);

      const nomes = new Map((profs.data ?? []).map((p) => [p.id, p.nome || "—"]));
      const porVenda = new Map<string, Contato[]>();
      for (const c of (contatos.data ?? []) as Contato[]) {
        const arr = porVenda.get(c.venda_id) ?? [];
        arr.push(c);
        porVenda.set(c.venda_id, arr);
      }
      const hoje = hojeISO();

      const montar = (
        v: any,
        tabela: "vendas_loja" | "vendas_pap",
        canal: "Loja" | "PAP",
      ): Item => {
        const lista = porVenda.get(v.id) ?? [];
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
        return {
          id: v.id,
          tabela,
          canal,
          vendedorId: v.vendedor_id,
          vendedor: nomes.get(v.vendedor_id) ?? "—",
          cliente: v.nome_cliente,
          protocolo: v.protocolo,
          ativacao: v.data_ativacao,
          fase,
          prazo,
          atrasado: !!prazo && prazo < hoje,
          motivoConclusao,
          contatos: lista,
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
                  <TableHead>Cliente</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Consultor</TableHead>
                  <TableHead>Ativação</TableHead>
                  <TableHead>Fase</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((i) => (
                  <>
                    <TableRow key={i.id}>
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
                      <TableCell className="font-medium">{i.cliente}</TableCell>
                      <TableCell>{i.canal}</TableCell>
                      <TableCell>{i.vendedor}</TableCell>
                      <TableCell>{dataBR(i.ativacao)}</TableCell>
                      <TableCell>
                        {i.fase === "satisfacao" ? (
                          <Badge variant="secondary">Satisfação</Badge>
                        ) : i.fase === "produtos" ? (
                          <Badge variant="secondary">Novos produtos</Badge>
                        ) : (
                          <Badge variant="outline">{i.motivoConclusao ?? "Concluído"}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {i.prazo ? (
                          <span
                            className={
                              i.atrasado ? "font-medium text-destructive" : "text-muted-foreground"
                            }
                          >
                            <CalendarClock className="mr-1 inline h-3.5 w-3.5" />
                            {dataBR(i.prazo)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {i.fase === "concluido" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const alvo: VendaAlvo = {
                                id: i.id,
                                tabela: i.tabela,
                                vendedorId: i.vendedorId,
                                cliente: i.cliente,
                              };
                              if (i.fase === "satisfacao") setAlvoSatisfacao(alvo);
                              else setAlvoProdutos(alvo);
                            }}
                          >
                            Registrar contato
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {expandido === i.id && (
                      <TableRow key={`${i.id}-hist`}>
                        <TableCell colSpan={9} className="bg-muted/40">
                          {i.contatos.length === 0 ? (
                            <p className="py-2 text-sm text-muted-foreground">
                              Nenhum contato registrado ainda.
                            </p>
                          ) : (
                            <div className="space-y-2 py-2">
                              {i.contatos.map((c) => (
                                <div key={c.id} className="rounded-lg border bg-background p-2 text-sm">
                                  <div className="text-xs text-muted-foreground">
                                    {dataHoraBR(c.created_at)} ·{" "}
                                    {c.fase === "satisfacao" ? "Satisfação" : "Novos produtos"}
                                  </div>
                                  {c.fase === "satisfacao" ? (
                                    <div>
                                      Resultado: <strong>{labelResultado(c.resultado)}</strong>
                                      {c.motivo ? ` — ${c.motivo}` : ""}
                                    </div>
                                  ) : (
                                    <ResumoProdutos produtos={c.produtos} />
                                  )}
                                  {c.observacao && (
                                    <div className="whitespace-pre-wrap text-muted-foreground">
                                      {c.observacao}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
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
    </div>
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
