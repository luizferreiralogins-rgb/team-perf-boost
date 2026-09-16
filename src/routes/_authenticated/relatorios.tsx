import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  ListChecks,
  Pencil,
  RadioTower,
  ReceiptText,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  FiltrosBar,
  aplicarFiltros,
  mesAtual,
  mesesRecentes,
  useEquipe,
  type Filtros,
  type Membro,
} from "@/components/dashboard/filtros-ranking";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios comerciais — Unifique" },
      {
        name: "description",
        content: "Crie relatórios de vendas, canais e reagendamentos conforme sua equipe.",
      },
      { property: "og:title", content: "Relatórios comerciais — Unifique" },
      {
        property: "og:description",
        content: "Relatórios de vendas, canais e reagendamentos com acesso por hierarquia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RelatoriosPage,
});

type TipoRelatorio = "reagendamentos" | "canais" | "tarefas";
type CanalVenda = "loja" | "pap";

type VendaRelatorio = {
  id: string;
  tabela: "vendas_loja" | "vendas_pap";
  canal: CanalVenda;
  vendedorId: string;
  vendedor: string;
  protocolo: string | null;
  cliente: string;
  data: string | null;
  canalOrigem: string;
  valor: number;
  comissao: number;
  status: string;
};

type Reagendamento = {
  id: string;
  vendaId: string;
  tabela: string;
  dataAnterior: string | null;
  dataNova: string | null;
  motivo: string;
  createdAt: string;
  autor: string;
};

const brl = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataBR = (valor?: string | null) =>
  valor ? new Date(`${valor.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR") : "—";

const dataHoraBR = (valor: string) =>
  new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function fimDoMes(mes: string) {
  const [ano, numeroMes] = mes.split("-").map(Number);
  const ultimoDia = new Date(ano, numeroMes, 0).getDate();
  return `${mes}-${String(ultimoDia).padStart(2, "0")}`;
}

function rolePrincipal(roles: string[]) {
  return (
    ["admin", "regional", "gerente_regional", "gerente", "lider_pap", "consultor"].find((role) =>
      roles.includes(role),
    ) ?? "consultor"
  );
}

function RelatoriosPage() {
  const [tipo, setTipo] = useState<TipoRelatorio | null>(null);
  const [filtros, setFiltros] = useState<Filtros>({
    mes: mesAtual(),
    pessoa: "all",
    unidades: [],
  });

  const me = useQuery({
    queryKey: ["me-relatorios"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return null;
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase
          .from("profiles")
          .select("id, nome, canal, loja_unidade, gerente_id")
          .eq("id", uid)
          .maybeSingle(),
      ]);
      const lista = (roles ?? []).map((item) => item.role as string);
      const role = rolePrincipal(lista);
      return {
        uid,
        role,
        isGestor: role !== "consultor",
        profile,
      };
    },
  });

  const equipe = useEquipe(me.data?.uid, me.data?.isGestor ? me.data.role : undefined);
  const membrosVisiveis = useMemo<Membro[]>(() => {
    if (!me.data) return [];
    if (me.data.isGestor) return equipe.data ?? [];
    const profile = me.data.profile;
    if (!profile) return [];
    return [
      {
        id: profile.id,
        nome: profile.nome,
        canal: profile.canal,
        loja_unidade: profile.loja_unidade,
        gerente_id: profile.gerente_id,
        role: "consultor",
      },
    ];
  }, [equipe.data, me.data]);

  const membrosFiltrados = useMemo(() => {
    if (!me.data) return [];
    if (!me.data.isGestor) return membrosVisiveis;
    return aplicarFiltros(membrosVisiveis, filtros, me.data.role);
  }, [filtros, me.data, membrosVisiveis]);

  const ids = useMemo(() => membrosFiltrados.map((membro) => membro.id), [membrosFiltrados]);
  const nomes = useMemo(
    () => new Map(membrosVisiveis.map((membro) => [membro.id, membro.nome])),
    [membrosVisiveis],
  );
  const carregandoEscopo = me.isLoading || (!!me.data?.isGestor && equipe.isLoading);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <ChartNoAxesCombined className="h-4 w-4" /> Central de análise
          </div>
          <h1 className="mt-1 text-3xl font-bold">Relatórios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {me.data?.isGestor
              ? "Analise somente os resultados das equipes sob sua gestão."
              : "Analise suas vendas e seus registros comerciais."}
          </p>
        </div>
        {tipo && (
          <Button variant="outline" onClick={() => setTipo(null)}>
            <ArrowLeft /> Trocar relatório
          </Button>
        )}
      </header>

      {!tipo ? (
        <EscolhaRelatorio onSelect={setTipo} />
      ) : tipo === "tarefas" ? (
        <RelatorioTarefas
          uid={me.data?.uid}
          meuNome={me.data?.profile?.nome ?? "Eu"}
          membros={membrosVisiveis}
          carregandoEscopo={carregandoEscopo}
        />
      ) : (
        <>
          {me.data?.isGestor && (
            <FiltrosBar
              role={me.data.role}
              membros={membrosVisiveis}
              filtros={filtros}
              onChange={setFiltros}
            />
          )}
          {me.data && !me.data.isGestor && (
            <Card>
              <CardContent className="p-4">
                <div className="max-w-xs space-y-1.5">
                  <Label className="text-xs">Mês</Label>
                  <Select
                    value={filtros.mes}
                    onValueChange={(mes) => setFiltros((atual) => ({ ...atual, mes }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {mesesRecentes().map((mes) => (
                        <SelectItem key={mes.value} value={mes.value} className="capitalize">
                          {mes.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}
          {tipo === "reagendamentos" ? (
            <RelatorioReagendamentos
              mes={filtros.mes}
              ids={ids}
              nomes={nomes}
              carregandoEscopo={carregandoEscopo}
            />
          ) : (
            <RelatorioCanais
              mes={filtros.mes}
              ids={ids}
              nomes={nomes}
              carregandoEscopo={carregandoEscopo}
            />
          )}
        </>
      )}
    </div>
  );
}

function EscolhaRelatorio({ onSelect }: { onSelect: (tipo: TipoRelatorio) => void }) {
  const opcoes = [
    {
      tipo: "reagendamentos" as const,
      icon: CalendarClock,
      titulo: "Vendas com reagendamentos",
      descricao: "Consulte todas as mudanças de data, seus motivos e quem registrou cada alteração.",
    },
    {
      tipo: "canais" as const,
      icon: RadioTower,
      titulo: "Vendas por canal de vendas",
      descricao: "Compare a origem das vendas por volume, receita, comissão e participação no período.",
    },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2" aria-label="Tipos de relatório">
      {opcoes.map((opcao) => (
        <Card key={opcao.tipo} className="group overflow-hidden transition-shadow hover:shadow-md">
          <CardHeader>
            <div className="mb-3 grid h-11 w-11 place-items-center rounded-md bg-primary/10 text-primary">
              <opcao.icon className="h-5 w-5" />
            </div>
            <CardTitle className="text-xl">{opcao.titulo}</CardTitle>
            <CardDescription className="min-h-10 leading-relaxed">{opcao.descricao}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full justify-between" onClick={() => onSelect(opcao.tipo)}>
              Criar relatório <ChevronRight />
            </Button>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function useVendasDoMes(mes: string, ids: string[]) {
  return useQuery({
    queryKey: ["relatorio-vendas", mes, ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async (): Promise<VendaRelatorio[]> => {
      const inicio = `${mes}-01`;
      const fim = fimDoMes(mes);
      const [{ data: loja, error: lojaError }, { data: pap, error: papError }] = await Promise.all([
        supabase
          .from("vendas_loja")
          .select("id, vendedor_id, protocolo, nome_cliente, data_abertura, canal_origem, valor_novo, comissao, status")
          .in("vendedor_id", ids)
          .gte("data_abertura", inicio)
          .lte("data_abertura", fim),
        supabase
          .from("vendas_pap")
          .select("id, vendedor_id, protocolo, nome_cliente, data_venda, canal_origem, valor, valor_novo, comissao, status")
          .in("vendedor_id", ids)
          .gte("data_venda", inicio)
          .lte("data_venda", fim),
      ]);
      if (lojaError) throw lojaError;
      if (papError) throw papError;

      return [
        ...(loja ?? []).map((venda) => ({
          id: venda.id,
          tabela: "vendas_loja" as const,
          canal: "loja" as const,
          vendedorId: venda.vendedor_id,
          vendedor: "",
          protocolo: venda.protocolo,
          cliente: venda.nome_cliente,
          data: venda.data_abertura,
          canalOrigem: venda.canal_origem?.trim() || "Não informado",
          valor: Number(venda.valor_novo ?? 0),
          comissao: Number(venda.comissao ?? 0),
          status: venda.status,
        })),
        ...(pap ?? []).map((venda) => ({
          id: venda.id,
          tabela: "vendas_pap" as const,
          canal: "pap" as const,
          vendedorId: venda.vendedor_id,
          vendedor: "",
          protocolo: venda.protocolo,
          cliente: venda.nome_cliente,
          data: venda.data_venda,
          canalOrigem: venda.canal_origem?.trim() || "Não informado",
          valor: Number(venda.valor_novo ?? 0) || Number(venda.valor ?? 0),
          comissao: Number(venda.comissao ?? 0),
          status: venda.status,
        })),
      ];
    },
  });
}

function RelatorioReagendamentos({
  mes,
  ids,
  nomes,
  carregandoEscopo,
}: {
  mes: string;
  ids: string[];
  nomes: Map<string, string>;
  carregandoEscopo: boolean;
}) {
  const vendas = useVendasDoMes(mes, ids);
  const vendaIds = useMemo(() => (vendas.data ?? []).map((venda) => venda.id), [vendas.data]);
  const historico = useQuery({
    queryKey: ["relatorio-reagendamentos", mes, ids.join(","), vendaIds.join(",")],
    enabled: vendaIds.length > 0,
    queryFn: async (): Promise<Reagendamento[]> => {
      const { data, error } = await supabase
        .from("agendamento_historico")
        .select("id, venda_id, tabela, data_anterior, data_nova, motivo, created_at, criado_por")
        .in("vendedor_id", ids)
        .in("venda_id", vendaIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const autoresIds = [...new Set((data ?? []).map((item) => item.criado_por))];
      const autores = new Map<string, string>();
      if (autoresIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, nome")
          .in("id", autoresIds);
        for (const profile of profiles ?? []) autores.set(profile.id, profile.nome);
      }
      return (data ?? []).map((item) => ({
        id: item.id,
        vendaId: item.venda_id,
        tabela: item.tabela,
        dataAnterior: item.data_anterior,
        dataNova: item.data_nova,
        motivo: item.motivo,
        createdAt: item.created_at,
        autor: autores.get(item.criado_por) ?? "Usuário",
      }));
    },
  });

  const vendasPorId = useMemo(
    () => new Map((vendas.data ?? []).map((venda) => [venda.id, venda])),
    [vendas.data],
  );
  const grupos = useMemo(() => {
    const mapa = new Map<string, Reagendamento[]>();
    for (const registro of historico.data ?? []) {
      const lista = mapa.get(registro.vendaId) ?? [];
      lista.push(registro);
      mapa.set(registro.vendaId, lista);
    }
    return [...mapa.entries()]
      .map(([vendaId, registros]) => ({ venda: vendasPorId.get(vendaId), registros }))
      .filter((grupo): grupo is { venda: VendaRelatorio; registros: Reagendamento[] } => !!grupo.venda);
  }, [historico.data, vendasPorId]);

  const carregando = carregandoEscopo || vendas.isLoading || historico.isLoading;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" /> Vendas com reagendamentos
        </CardTitle>
        <CardDescription>
          {grupos.length} venda(s) · {historico.data?.length ?? 0} alteração(ões) de data
        </CardDescription>
      </CardHeader>
      <CardContent>
        {carregando ? (
          <CarregandoRelatorio />
        ) : grupos.length === 0 ? (
          <Vazio texto="Nenhum reagendamento encontrado para o período e filtros selecionados." />
        ) : (
          <div className="space-y-4">
            {grupos.map(({ venda, registros }) => (
              <article key={`${venda.tabela}-${venda.id}`} className="rounded-md border">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-muted/30 p-4">
                  <div className="min-w-44 flex-1">
                    <p className="font-semibold">{venda.cliente}</p>
                    <p className="text-sm text-muted-foreground">
                      {venda.protocolo || "Sem protocolo"} · {nomes.get(venda.vendedorId) ?? "—"}
                    </p>
                  </div>
                  <Badge variant="outline">{venda.canal === "pap" ? "PAP" : "Loja"}</Badge>
                  <Badge variant="secondary">{registros.length} reagendamento(s)</Badge>
                  <Button asChild variant="ghost" size="icon" title="Editar venda">
                    <Link to="/vendas/$id" params={{ id: venda.id }} aria-label="Editar venda">
                      <Pencil />
                    </Link>
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data anterior</TableHead>
                        <TableHead>Nova data</TableHead>
                        <TableHead className="min-w-64">Motivo</TableHead>
                        <TableHead>Registrado por</TableHead>
                        <TableHead>Registro</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registros.map((registro) => (
                        <TableRow key={registro.id}>
                          <TableCell className="whitespace-nowrap">{dataBR(registro.dataAnterior)}</TableCell>
                          <TableCell className="whitespace-nowrap font-medium">{dataBR(registro.dataNova)}</TableCell>
                          <TableCell>{registro.motivo}</TableCell>
                          <TableCell className="whitespace-nowrap">{registro.autor}</TableCell>
                          <TableCell className="whitespace-nowrap">{dataHoraBR(registro.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RelatorioCanais({
  mes,
  ids,
  nomes,
  carregandoEscopo,
}: {
  mes: string;
  ids: string[];
  nomes: Map<string, string>;
  carregandoEscopo: boolean;
}) {
  const vendas = useVendasDoMes(mes, ids);
  const grupos = useMemo(() => {
    const mapa = new Map<string, { nome: string; quantidade: number; receita: number; comissao: number }>();
    for (const venda of vendas.data ?? []) {
      const chave = venda.canalOrigem.toLocaleLowerCase("pt-BR");
      const atual = mapa.get(chave) ?? {
        nome: venda.canalOrigem,
        quantidade: 0,
        receita: 0,
        comissao: 0,
      };
      atual.quantidade += 1;
      atual.receita += venda.valor;
      atual.comissao += venda.comissao;
      mapa.set(chave, atual);
    }
    return [...mapa.values()].sort((a, b) => b.quantidade - a.quantidade || b.receita - a.receita);
  }, [vendas.data]);
  const total = useMemo(
    () => ({
      quantidade: (vendas.data ?? []).length,
      receita: (vendas.data ?? []).reduce((soma, venda) => soma + venda.valor, 0),
      comissao: (vendas.data ?? []).reduce((soma, venda) => soma + venda.comissao, 0),
    }),
    [vendas.data],
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumo do relatório">
        <Resumo titulo="Vendas" valor={String(total.quantidade)} icon={ReceiptText} />
        <Resumo titulo="Receita" valor={brl(total.receita)} icon={ChartNoAxesCombined} />
        <Resumo titulo="Comissão" valor={brl(total.comissao)} icon={RadioTower} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Desempenho por canal de vendas</CardTitle>
          <CardDescription>Comparativo das origens registradas nas vendas selecionadas.</CardDescription>
        </CardHeader>
        <CardContent>
          {carregandoEscopo || vendas.isLoading ? (
            <CarregandoRelatorio />
          ) : grupos.length === 0 ? (
            <Vazio texto="Nenhuma venda encontrada para o período e filtros selecionados." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {grupos.map((grupo, indice) => {
                const participacao = total.quantidade ? (grupo.quantidade / total.quantidade) * 100 : 0;
                return (
                  <div key={grupo.nome} className="rounded-md border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{grupo.nome}</p>
                        <p className="text-xs text-muted-foreground">{participacao.toFixed(1)}% das vendas</p>
                      </div>
                      <Badge variant={indice === 0 ? "default" : "secondary"}>{grupo.quantidade}</Badge>
                    </div>
                    <Progress value={participacao} className="my-4 h-2" />
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Receita</p>
                        <p className="font-medium">{brl(grupo.receita)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Comissão</p>
                        <p className="font-medium">{brl(grupo.comissao)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vendas consideradas</CardTitle>
          <CardDescription>{total.quantidade} registro(s) no relatório.</CardDescription>
        </CardHeader>
        <CardContent>
          {carregandoEscopo || vendas.isLoading ? (
            <CarregandoRelatorio />
          ) : (vendas.data ?? []).length === 0 ? (
            <Vazio texto="Não há vendas para detalhar." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Protocolo</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Canal de vendas</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Receita</TableHead>
                    <TableHead>Comissão</TableHead>
                    <TableHead className="w-12"><span className="sr-only">Editar</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(vendas.data ?? [])
                    .slice()
                    .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""))
                    .map((venda) => (
                      <TableRow key={`${venda.tabela}-${venda.id}`}>
                        <TableCell className="whitespace-nowrap">{venda.protocolo || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{dataBR(venda.data)}</TableCell>
                        <TableCell className="whitespace-nowrap">{nomes.get(venda.vendedorId) ?? "—"}</TableCell>
                        <TableCell>{venda.cliente}</TableCell>
                        <TableCell>{venda.canalOrigem}</TableCell>
                        <TableCell><Badge variant="outline">{venda.canal === "pap" ? "PAP" : "Loja"}</Badge></TableCell>
                        <TableCell className="whitespace-nowrap font-medium">{brl(venda.valor)}</TableCell>
                        <TableCell className="whitespace-nowrap">{brl(venda.comissao)}</TableCell>
                        <TableCell>
                          <Button asChild variant="ghost" size="icon" title="Editar venda">
                            <Link to="/vendas/$id" params={{ id: venda.id }} aria-label="Editar venda">
                              <Pencil />
                            </Link>
                          </Button>
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

function Resumo({ titulo, valor, icon: Icon }: { titulo: string; valor: string; icon: typeof ReceiptText }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{titulo}</p>
          <p className="truncate text-lg font-semibold">{valor}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CarregandoRelatorio() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">{texto}</div>;
}