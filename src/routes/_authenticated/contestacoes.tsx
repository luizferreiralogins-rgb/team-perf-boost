import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ClipboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ClipboardPaste, Save, ScanSearch, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { salvarRelatorioContestacao, limparRelatorioContestacao } from "@/lib/contestacao-manual.functions";
import {
  diferencaTicket,
  ehCorePap,
  faixaEfetivaLoja,
  faixaPap,
  tipoComissaoLoja,
  type LojaFaixaTicket,
  type LojaMeta,
  type LojaNovoProduto,
  type PapFaixa,
  type PapNovoProduto,
} from "@/lib/comissao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

export const Route = createFileRoute("/_authenticated/contestacoes")({
  head: () => ({
    meta: [
      { title: "Contestações — Unifique Comercial" },
      {
        name: "description",
        content:
          "Consulte o relatório matriz importado pelo Gerente Regional e verifique divergências com as suas vendas do mês.",
      },
      { property: "og:title", content: "Contestações — Unifique Comercial" },
      {
        property: "og:description",
        content: "Relatório matriz x vendas do consultor: protocolos, valores, faixa e comissão.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Contestacoes,
});

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mesAtual = () => new Date().toISOString().slice(0, 7);
const perto = (a: number, b: number) => Math.abs((a || 0) - (b || 0)) <= 0.01;

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const normProt = (s: string | null | undefined) => (s ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

type Matriz = {
  id: string;
  protocolo: string | null;
  nome_cliente: string;
  consultor_nome: string | null;
  classe_protocolo: string | null;
  tecnologia: string | null;
  valor_novo: number;
  valor_antigo: number;
  diferenca: number;
  faixa: number;
  comissao: number;
  data_instalacao: string | null;
};

type LinhaColada = {
  protocolo: string;
  vendedor: string;
  classe: string;
  tecnologia: string;
  valor_novo: number;
  valor_antigo: number;
  diferenca: number;
  faixa: number;
  comissao: number;
};

const numeroColado = (valor: string) => {
  const limpo = valor.trim().replace(/R\$|\s/g, "");
  if (!limpo) return 0;
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  const numero = Number(normalizado.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numero) ? numero : 0;
};

const linhasDaAreaTransferencia = (texto: string): LinhaColada[] =>
  texto
    .split(/\r?\n/)
    .map((linha) => linha.split("\t"))
    .filter((colunas) => colunas.some((valor) => valor.trim()))
    .filter((colunas, indice) => !(indice === 0 && norm(colunas[0]).includes("PROTOCOLO")))
    .map((colunas) => ({
      protocolo: (colunas[0] ?? "").trim(),
      vendedor: (colunas[1] ?? "").trim(),
      classe: (colunas[2] ?? "").trim(),
      tecnologia: (colunas[3] ?? "").trim(),
      valor_novo: numeroColado(colunas[4] ?? ""),
      valor_antigo: numeroColado(colunas[5] ?? ""),
      diferenca: numeroColado(colunas[6] ?? ""),
      faixa: numeroColado(colunas[7] ?? ""),
      comissao: numeroColado(colunas[8] ?? ""),
    }))
    .filter((linha) => linha.protocolo && linha.vendedor);

type VendaConsultor = {
  id: string;
  protocolo: string | null;
  cliente: string;
  classe: string;
  tecnologia: string;
  valor_novo: number;
  valor_antigo: number;
  diferenca: number;
  comissao: number;
  data: string | null;
  vendedor_id: string;
  vendedor_nome: string;
};

function Contestacoes() {
  const qc = useQueryClient();
  const [mes, setMes] = useState(mesAtual());
  const [canal, setCanal] = useState<"loja" | "pap">("loja");
  const [consultor, setConsultor] = useState("todos");
  const [gerente, setGerente] = useState("todos");
  const [linhasColadas, setLinhasColadas] = useState<LinhaColada[]>([]);
  const [verificado, setVerificado] = useState(false);

  const me = useQuery({
    queryKey: ["contest-me"],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user!.id;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("nome, canal, gerente_id").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      const list = (roles ?? []).map((r) => r.role as string);
      return {
        uid,
        nome: profile?.nome ?? "",
        canal: (profile?.canal ?? "loja") as "loja" | "pap",
        isGestor: list.some((r) => r === "gerente" || r === "regional" || r === "admin"),
        isGerente: list.some((r) => r === "gerente"),
        isRegional: list.some((r) => r === "regional" || r === "admin"),
        gerenteId: profile?.gerente_id ?? null,
      };
    },
    staleTime: 60_000,
  });

  const canalPerfil = me.data?.canal;
  useEffect(() => {
    if (canalPerfil) setCanal(canalPerfil);
  }, [canalPerfil]);

  const canalEfetivo = canal;
  // Consultor compara sempre com as vendas do seu próprio canal, mesmo que o
  // relatório da equipe tenha sido publicado em outro canal pelo gerente.
  const canalVendas = me.data?.isGestor ? canalEfetivo : (me.data?.canal ?? canalEfetivo);

  const dados = useQuery({
    enabled: !!me.data,
    queryKey: ["contestacoes", mes, canalEfetivo, canalVendas, gerente],
    queryFn: async () => {
      const inicio = `${mes}-01`;
      const fimDate = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0);
      const fim = `${mes}-${String(fimDate.getDate()).padStart(2, "0")}`;

       let importacoesQuery = supabase
         .from("contestacao_importacoes")
         .select("id, arquivo_nome, total_linhas, created_at, gerente_id, profiles!contestacao_importacoes_gerente_id_fkey(nome)")
         .eq("mes_ref", inicio)
         .eq("canal", canalEfetivo);
       if (me.data?.isRegional && gerente !== "todos") importacoesQuery = importacoesQuery.eq("gerente_id", gerente);

       const [{ data: importacoes }, { data: gestores }] = await Promise.all([
         importacoesQuery,
         me.data?.isRegional
           ? supabase.from("profiles").select("id, nome, user_roles!inner(role)").eq("user_roles.role", "gerente").eq("ativo", true)
           : Promise.resolve({ data: [] }),
       ]);
       const importacaoIds = (importacoes ?? []).map((item) => item.id);
       const { data: nativas } = importacaoIds.length
         ? await supabase
           .from("contestacao_vendas_nativas")
           .select("id, protocolo, nome_cliente, consultor_nome, classe_protocolo, tecnologia, valor_novo, valor_antigo, diferenca, faixa, comissao, valor, data_instalacao")
           .in("importacao_id", importacaoIds)
           .limit(5000)
         : { data: [] };

      const matriz: Matriz[] = (nativas ?? []).map((n) => ({
        id: n.id,
        protocolo: n.protocolo,
        nome_cliente: n.nome_cliente,
        consultor_nome: n.consultor_nome,
        classe_protocolo: n.classe_protocolo,
        tecnologia: n.tecnologia,
        valor_novo: Number(n.valor_novo ?? 0) || Number(n.valor ?? 0),
        valor_antigo: Number(n.valor_antigo ?? 0),
        diferenca: Number(n.diferenca ?? 0),
        faixa: Number(n.faixa ?? 0),
        comissao: Number(n.comissao ?? 0),
        data_instalacao: n.data_instalacao,
      }));

      let vendas: VendaConsultor[] = [];
      let faixaSistema = 0;

      if (canalVendas === "loja") {
        const [{ data: rows }, { data: metas }, { data: novos }] = await Promise.all([
          supabase
            .from("vendas_loja")
            .select(
              "id, protocolo, nome_cliente, classe_protocolo, tecnologia, contem_movel, valor_novo, valor_antigo, comissao, data_ativacao, vendedor_id",
            )
            .eq("status", "instalado")
            .gte("data_ativacao", inicio)
            .lte("data_ativacao", fim)
            .limit(5000),
          supabase.from("parametros_loja_metas").select("faixa, meta_receita, meta_renov_movel"),
          supabase.from("parametros_loja_novos_produtos").select("codigo, nome, percentual"),
        ]);
        const listaNovos = (novos ?? []) as LojaNovoProduto[];
        vendas = (rows ?? []).map((v) => ({
          id: v.id,
          protocolo: v.protocolo,
          cliente: v.nome_cliente,
          classe: v.classe_protocolo ?? "",
          tecnologia: v.tecnologia ?? "",
          valor_novo: Number(v.valor_novo ?? 0),
          valor_antigo: Number(v.valor_antigo ?? 0),
          diferenca: diferencaTicket(Number(v.valor_novo ?? 0), v.valor_antigo),
          comissao: Number(v.comissao ?? 0),
          data: v.data_ativacao,
          vendedor_id: v.vendedor_id,
          vendedor_nome: "",
        }));
        const receita = vendas.reduce((s, v) => s + v.diferenca, 0);
        const tipos = (rows ?? []).map((v) =>
          tipoComissaoLoja(v.classe_protocolo ?? "", !!v.contem_movel, v.tecnologia ?? "", listaNovos),
        );
        const totalRenov = tipos.filter((t) => t.startsWith("Renovação")).length;
        const renovMovel = tipos.filter((t) => t === "Renovação com Mobilidade").length;
        faixaSistema = faixaEfetivaLoja(
          (metas ?? []) as LojaMeta[],
          receita,
          totalRenov > 0 ? renovMovel / totalRenov : 0,
        );
      } else {
        const [{ data: rows }, { data: faixas }, { data: produtos }] = await Promise.all([
          supabase
            .from("vendas_pap")
            .select(
              "id, protocolo, nome_cliente, tipo_protocolo, produto, tecnologia, valor, comissao, data_ativacao, vendedor_id",
            )
            .eq("status", "instalado")
            .gte("data_ativacao", inicio)
            .lte("data_ativacao", fim)
            .limit(5000),
          supabase
            .from("parametros_pap_faixas")
            .select(
              "faixa, receita_de, receita_ate, pct_comissao, meta_max_cancel, acelerador_baixo_cancel, bonus_venda_indireta",
            ),
          supabase
            .from("parametros_pap_novos_produtos")
            .select("codigo, nome, percentual, limitado, limite"),
        ]);
        const listaProdutos = (produtos ?? []) as PapNovoProduto[];
        vendas = (rows ?? []).map((v) => ({
          id: v.id,
          protocolo: v.protocolo,
          cliente: v.nome_cliente,
          classe: v.tipo_protocolo ?? "",
          tecnologia: v.produto ?? v.tecnologia ?? "",
          valor_novo: Number(v.valor ?? 0),
          valor_antigo: 0,
          diferenca: Number(v.valor ?? 0),
          comissao: Number(v.comissao ?? 0),
          data: v.data_ativacao,
          vendedor_id: v.vendedor_id,
          vendedor_nome: "",
        }));
        const core = (rows ?? [])
          .filter((v) => ehCorePap(v.tipo_protocolo ?? "", v.produto ?? "", listaProdutos))
          .reduce((s, v) => s + Number(v.valor ?? 0), 0);
        faixaSistema = faixaPap((faixas ?? []) as PapFaixa[], core)?.faixa ?? 0;
      }

      const ids = [...new Set(vendas.map((v) => v.vendedor_id))];
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", ids);
        const map = new Map((profs ?? []).map((p) => [p.id, p.nome]));
        vendas = vendas.map((v) => ({ ...v, vendedor_nome: map.get(v.vendedor_id) ?? "—" }));
      }

       return { matriz, vendas, importacoes: importacoes ?? [], gestores: gestores ?? [], faixaSistema };
    },
  });

  const filtro = me.data?.isGestor ? consultor : (me.data?.nome ?? "todos");
  const alvo = filtro === "todos" ? null : norm(filtro);

  const matrizFiltrada = useMemo(() => {
    const rows = dados.data?.matriz ?? [];
    return alvo ? rows.filter((n) => norm(n.consultor_nome).includes(alvo)) : rows;
  }, [dados.data, alvo]);

  const vendasFiltradas = useMemo(() => {
    const rows = dados.data?.vendas ?? [];
    return alvo ? rows.filter((v) => norm(v.vendedor_nome).includes(alvo)) : rows;
  }, [dados.data, alvo]);

  // Nova filtragem exige nova verificação.
  useEffect(() => {
    setVerificado(false);
  }, [mes, canalEfetivo, consultor, gerente]);

  const comparacao = useMemo(() => {
    const chaveM = (m: Matriz) => normProt(m.protocolo) || norm(m.nome_cliente);
    const chaveV = (v: VendaConsultor) => normProt(v.protocolo) || norm(v.cliente);

    const mapV = new Map(vendasFiltradas.map((v) => [chaveV(v), v]));
    const mapM = new Map(matrizFiltrada.map((m) => [chaveM(m), m]));

    const soMatriz = matrizFiltrada.filter((m) => !mapV.has(chaveM(m)));
    const soConsultor = vendasFiltradas.filter((v) => !mapM.has(chaveV(v)));

    const divergencias: Array<{
      id: string;
      protocolo: string;
      cliente: string;
      campos: Array<{ campo: string; matriz: number; consultor: number }>;
    }> = [];

    matrizFiltrada.forEach((m) => {
      const v = mapV.get(chaveM(m));
      if (!v) return;
      const campos: Array<{ campo: string; matriz: number; consultor: number }> = [];
      if (!perto(m.valor_novo, v.valor_novo))
        campos.push({ campo: "Preço novo", matriz: m.valor_novo, consultor: v.valor_novo });
      if (canalVendas === "loja" && !perto(m.valor_antigo, v.valor_antigo))
        campos.push({ campo: "Preço antigo", matriz: m.valor_antigo, consultor: v.valor_antigo });
      if (!perto(m.diferenca, v.diferenca))
        campos.push({ campo: "Diferença", matriz: m.diferenca, consultor: v.diferenca });
      if (!perto(m.comissao, v.comissao))
        campos.push({ campo: "Comissão", matriz: m.comissao, consultor: v.comissao });
      if (campos.length)
        divergencias.push({ id: m.id, protocolo: m.protocolo ?? "—", cliente: m.nome_cliente, campos });
    });

    const somaM = {
      qtd: matrizFiltrada.length,
      receita: matrizFiltrada.reduce((s, m) => s + m.diferenca, 0),
      faixa: matrizFiltrada.filter((m) => m.faixa > 0).length
        ? matrizFiltrada.reduce((s, m) => s + m.faixa, 0) /
          matrizFiltrada.filter((m) => m.faixa > 0).length
        : 0,
      comissao: matrizFiltrada.reduce((s, m) => s + m.comissao, 0),
    };
    const somaV = {
      qtd: vendasFiltradas.length,
      receita: vendasFiltradas.reduce((s, v) => s + v.diferenca, 0),
      faixa: dados.data?.faixaSistema ?? 0,
      comissao: vendasFiltradas.reduce((s, v) => s + v.comissao, 0),
    };

    return {
      soMatriz,
      soConsultor,
      divergencias,
      conciliadas: matrizFiltrada.length - soMatriz.length,
      somaM,
      somaV,
    };
  }, [matrizFiltrada, vendasFiltradas, canalEfetivo, canalVendas, dados.data]);

  const salvar = useMutation({
    mutationFn: () => salvarRelatorioContestacao({ data: { canal: canalEfetivo, mes_ref: mes, linhas: linhasColadas } }),
    onSuccess: (r) => {
      toast.success(`Relatório publicado com ${r.total} vendas.`);
      setLinhasColadas([]);
      qc.invalidateQueries({ queryKey: ["contestacoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const limpar = useMutation({
    mutationFn: () => limparRelatorioContestacao({ data: { canal: canalEfetivo, mes_ref: mes } }),
    onSuccess: (r) => {
      toast.success(
        r.removidos
          ? "Relatório limpo. Cole uma nova tabela e publique."
          : "Não havia relatório publicado para este mês/canal.",
      );
      setLinhasColadas([]);
      qc.invalidateQueries({ queryKey: ["contestacoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const colarTabela = (evento: ClipboardEvent<HTMLInputElement>) => {
    evento.preventDefault();
    const linhas = linhasDaAreaTransferencia(evento.clipboardData.getData("text/plain"));
    if (!linhas.length) {
      toast.error("Não foi possível identificar linhas com Protocolo e Vendedor.");
      return;
    }
    setLinhasColadas(linhas);
    toast.success(`${linhas.length} linha(s) preenchida(s). Revise e publique o relatório.`);
  };


  const consultores = useMemo(() => {
    const set = new Set<string>();
    (dados.data?.vendas ?? []).forEach((v) => v.vendedor_nome && set.add(v.vendedor_nome));
    (dados.data?.matriz ?? []).forEach((n) => n.consultor_nome && set.add(n.consultor_nome));
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [dados.data]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Contestações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Relatórios publicados pelos Gerentes para suas respectivas equipes.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="mes">Mês</Label>
            <Input id="mes" type="month" value={mes} onChange={(e) => setMes(e.target.value || mesAtual())} />
          </div>
          {me.data?.isRegional && (
            <div className="space-y-1.5">
              <Label>Gerente</Label>
              <Select value={gerente} onValueChange={setGerente}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {(dados.data?.gestores ?? []).map((gestor) => (
                    <SelectItem key={gestor.id} value={gestor.id}>
                      {gestor.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Canal</Label>
            <Select
              value={canalEfetivo}
              onValueChange={(v) => setCanal(v as "loja" | "pap")}
              
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="loja">Loja</SelectItem>
                <SelectItem value="pap">PAP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {me.data?.isGestor ? (
            <div className="space-y-1.5">
              <Label>Consultor</Label>
              <Select value={consultor} onValueChange={setConsultor}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {consultores.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Consultor</Label>
              <Input value={me.data?.nome ?? ""} readOnly disabled />
            </div>
          )}
        </CardContent>
      </Card>

      {me.data?.isGerente && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardPaste className="h-4 w-4" /> Publicar relatório da equipe
            </CardTitle>
            <CardDescription>
              Copie no Excel as nove colunas na ordem exibida e cole na primeira célula abaixo de
              Protocolo. A publicação substitui o seu relatório anterior de {mes} para este canal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 overflow-x-auto">
            <Table className="min-w-[1050px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Protocolo</TableHead><TableHead>Vendedor</TableHead>
                  <TableHead>Classe</TableHead><TableHead>Tecnologia</TableHead>
                  <TableHead className="text-right">Preço Novo</TableHead>
                  <TableHead className="text-right">Preço Antigo</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                  <TableHead className="text-right">Faixa</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhasColadas.length === 0 ? (
                  <TableRow>
                    <TableCell>
                      <Input aria-label="Colar tabela do Excel" placeholder="Clique e cole aqui" onPaste={colarTabela} />
                    </TableCell>
                    {Array.from({ length: 8 }).map((_, index) => <TableCell key={index}>—</TableCell>)}
                  </TableRow>
                ) : linhasColadas.map((linha, index) => (
                  <TableRow key={`${linha.protocolo}-${index}`}>
                    <TableCell>{linha.protocolo}</TableCell><TableCell>{linha.vendedor}</TableCell>
                    <TableCell>{linha.classe || "—"}</TableCell><TableCell>{linha.tecnologia || "—"}</TableCell>
                    <TableCell className="text-right">{brl(linha.valor_novo)}</TableCell>
                    <TableCell className="text-right">{brl(linha.valor_antigo)}</TableCell>
                    <TableCell className="text-right">{brl(linha.diferenca)}</TableCell>
                    <TableCell className="text-right">{linha.faixa || "—"}</TableCell>
                    <TableCell className="text-right">{brl(linha.comissao)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{linhasColadas.length} linha(s) pronta(s) para publicação.</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => limpar.mutate()}
                  disabled={limpar.isPending || salvar.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {limpar.isPending ? "Limpando..." : "Limpar"}
                </Button>
                <Button onClick={() => salvar.mutate()} disabled={!linhasColadas.length || salvar.isPending}>
                  <Save className="mr-2 h-4 w-4" />
                  {salvar.isPending ? "Publicando..." : "Publicar relatório"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {dados.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">Relatório de contestações</CardTitle>
                <CardDescription>
                  {matrizFiltrada.length} protocolo(s) para o filtro selecionado.
                </CardDescription>
              </div>
              <Button onClick={() => setVerificado(true)} disabled={!matrizFiltrada.length}>
                <ScanSearch className="mr-2 h-4 w-4" /> Verificar
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {matrizFiltrada.length === 0 ? (
                <Vazio texto="Nenhum registro do relatório matriz para este mês, canal e consultor." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Protocolo</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Classe do Protocolo</TableHead>
                      <TableHead>Tecnologia</TableHead>
                      <TableHead className="text-right">Preço Novo</TableHead>
                      <TableHead className="text-right">Preço Antigo</TableHead>
                      <TableHead className="text-right">Diferença</TableHead>
                      <TableHead className="text-right">Faixa</TableHead>
                      <TableHead className="text-right">Comissão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matrizFiltrada.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap">{m.protocolo ?? "—"}</TableCell>
                        <TableCell>{m.consultor_nome ?? "—"}</TableCell>
                        <TableCell>{m.classe_protocolo ?? "—"}</TableCell>
                        <TableCell>{m.tecnologia ?? "—"}</TableCell>
                        <TableCell className="text-right">{brl(m.valor_novo)}</TableCell>
                        <TableCell className="text-right">{brl(m.valor_antigo)}</TableCell>
                        <TableCell className="text-right">{brl(m.diferenca)}</TableCell>
                        <TableCell className="text-right">{m.faixa || "—"}</TableCell>
                        <TableCell className="text-right">{brl(m.comissao)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {verificado && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Kpi titulo="Conciliadas" valor={comparacao.conciliadas} tom="ok" />
                <Kpi titulo="Só no relatório matriz" valor={comparacao.soMatriz.length} />
                <Kpi titulo="Só no registro do consultor" valor={comparacao.soConsultor.length} />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    No relatório matriz e sem registro do consultor
                    <Badge variant="destructive">{comparacao.soMatriz.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {comparacao.soMatriz.length === 0 ? (
                    <Vazio texto="Todos os protocolos do relatório matriz possuem registro do consultor." />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Protocolo</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Vendedor</TableHead>
                          <TableHead className="text-right">Diferença</TableHead>
                          <TableHead className="text-right">Comissão</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comparacao.soMatriz.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell className="whitespace-nowrap">{m.protocolo ?? "—"}</TableCell>
                            <TableCell>{m.nome_cliente}</TableCell>
                            <TableCell>{m.consultor_nome ?? "—"}</TableCell>
                            <TableCell className="text-right">{brl(m.diferenca)}</TableCell>
                            <TableCell className="text-right">{brl(m.comissao)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Registradas pelo consultor e ausentes no relatório matriz
                    <Badge variant="destructive">{comparacao.soConsultor.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {comparacao.soConsultor.length === 0 ? (
                    <Vazio texto="Todas as vendas do consultor constam no relatório matriz." />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Protocolo</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Vendedor</TableHead>
                          <TableHead className="text-right">Diferença</TableHead>
                          <TableHead className="text-right">Comissão</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comparacao.soConsultor.map((v) => (
                          <TableRow key={v.id}>
                            <TableCell className="whitespace-nowrap">{v.protocolo ?? "—"}</TableCell>
                            <TableCell>{v.cliente}</TableCell>
                            <TableCell>{v.vendedor_nome}</TableCell>
                            <TableCell className="text-right">{brl(v.diferenca)}</TableCell>
                            <TableCell className="text-right">{brl(v.comissao)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Divergências de valores nos protocolos conciliados
                    <Badge variant="destructive">{comparacao.divergencias.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {comparacao.divergencias.length === 0 ? (
                    <Vazio texto="Nenhuma divergência de preço novo, preço antigo, diferença ou comissão." />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Protocolo</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Campo</TableHead>
                          <TableHead className="text-right">Matriz</TableHead>
                          <TableHead className="text-right">Consultor</TableHead>
                          <TableHead className="text-right">Diferença</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comparacao.divergencias.flatMap((d) =>
                          d.campos.map((c) => (
                            <TableRow key={`${d.id}-${c.campo}`}>
                              <TableCell className="whitespace-nowrap">{d.protocolo}</TableCell>
                              <TableCell>{d.cliente}</TableCell>
                              <TableCell>{c.campo}</TableCell>
                              <TableCell className="text-right">{brl(c.matriz)}</TableCell>
                              <TableCell className="text-right">{brl(c.consultor)}</TableCell>
                              <TableCell className="text-right font-medium text-destructive">
                                {brl(c.matriz - c.consultor)}
                              </TableCell>
                            </TableRow>
                          )),
                        )}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Resumo acumulado — Matriz x Consultor</CardTitle>
                  <CardDescription>
                    Comparação considerando apenas as vendas filtradas em ambos os relatórios.
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Indicador</TableHead>
                        <TableHead className="text-right">Matriz</TableHead>
                        <TableHead className="text-right">Consultor</TableHead>
                        <TableHead className="text-right">Diferença</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <LinhaResumo
                        label="Qtd de Protocolos"
                        matriz={comparacao.somaM.qtd}
                        consultor={comparacao.somaV.qtd}
                        formato="int"
                      />
                      <LinhaResumo
                        label="Receita Geral"
                        matriz={comparacao.somaM.receita}
                        consultor={comparacao.somaV.receita}
                        formato="brl"
                      />
                      <LinhaResumo
                        label="Faixa Média"
                        matriz={comparacao.somaM.faixa}
                        consultor={comparacao.somaV.faixa}
                        formato="num"
                      />
                      <LinhaResumo
                        label="Comissão Total"
                        matriz={comparacao.somaM.comissao}
                        consultor={comparacao.somaV.comissao}
                        formato="brl"
                      />
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function LinhaResumo({
  label,
  matriz,
  consultor,
  formato,
}: {
  label: string;
  matriz: number;
  consultor: number;
  formato: "int" | "brl" | "num";
}) {
  const fmt = (n: number) => (formato === "brl" ? brl(n) : formato === "int" ? String(n) : num(n));
  const delta = matriz - consultor;
  return (
    <TableRow>
      <TableCell className="font-medium">{label}</TableCell>
      <TableCell className="text-right">{fmt(matriz)}</TableCell>
      <TableCell className="text-right">{fmt(consultor)}</TableCell>
      <TableCell
        className={`text-right font-medium ${perto(delta, 0) ? "text-muted-foreground" : "text-destructive"}`}
      >
        {fmt(delta)}
      </TableCell>
    </TableRow>
  );
}

function Kpi({ titulo, valor, tom }: { titulo: string; valor: number; tom?: "ok" }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</div>
        <div className="mt-1 flex items-center gap-2 text-2xl font-bold">
          {tom === "ok" && <CheckCircle2 className="h-5 w-5 text-primary" />}
          {valor}
        </div>
      </CardContent>
    </Card>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {texto}
    </div>
  );
}
