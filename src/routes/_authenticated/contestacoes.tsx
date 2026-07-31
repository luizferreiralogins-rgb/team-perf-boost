import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, ScanSearch, Upload } from "lucide-react";
import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";
import { importarPlanilhaNativa } from "@/lib/contestacao.functions";
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
  const [verificado, setVerificado] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const me = useQuery({
    queryKey: ["contest-me"],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user!.id;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("nome, canal").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      const list = (roles ?? []).map((r) => r.role as string);
      return {
        uid,
        nome: profile?.nome ?? "",
        canal: (profile?.canal ?? "loja") as "loja" | "pap",
        isGestor: list.some((r) => r === "gerente" || r === "regional" || r === "admin"),
        isRegional: list.some((r) => r === "regional" || r === "admin"),
      };
    },
    staleTime: 60_000,
  });

  const canalEfetivo = me.data?.isGestor ? canal : (me.data?.canal ?? "loja");

  const dados = useQuery({
    enabled: !!me.data,
    queryKey: ["contestacoes", mes, canalEfetivo],
    queryFn: async () => {
      const inicio = `${mes}-01`;
      const fimDate = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0);
      const fim = `${mes}-${String(fimDate.getDate()).padStart(2, "0")}`;

      const [{ data: nativas }, { data: importacao }] = await Promise.all([
        supabase
          .from("contestacao_vendas_nativas")
          .select(
            "id, protocolo, nome_cliente, consultor_nome, classe_protocolo, tecnologia, valor_novo, valor_antigo, diferenca, faixa, comissao, valor, data_instalacao",
          )
          .eq("mes_ref", inicio)
          .eq("canal", canalEfetivo)
          .limit(5000),
        supabase
          .from("contestacao_importacoes")
          .select("arquivo_nome, total_linhas, created_at")
          .eq("mes_ref", inicio)
          .eq("canal", canalEfetivo)
          .maybeSingle(),
      ]);

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

      if (canalEfetivo === "loja") {
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

      return { matriz, vendas, importacao, faixaSistema };
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
  }, [mes, canalEfetivo, consultor]);

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
      if (canalEfetivo === "loja" && !perto(m.valor_antigo, v.valor_antigo))
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
  }, [matrizFiltrada, vendasFiltradas, canalEfetivo, dados.data]);

  const importar = useMutation({
    mutationFn: async (file: File) => {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("A planilha está vazia.");
      const csv = XLSX.utils.sheet_to_csv(ws, { dateNF: "yyyy-mm-dd" });
      if (csv.trim().length < 10) throw new Error("Não foi possível ler o conteúdo da planilha.");

      // Divide arquivos grandes em partes (mantendo o cabeçalho em cada uma).
      const LIMITE = 150000;
      const linhas = csv.split(/\r?\n/).filter((l) => l.trim().length);
      const cabecalho = linhas[0] ?? "";
      const corpo = linhas.slice(1);
      const partes: string[] = [];
      let atual = "";
      for (const linha of corpo) {
        if (atual.length + linha.length + 1 > LIMITE && atual.length) {
          partes.push(`${cabecalho}\n${atual}`);
          atual = "";
        }
        atual += `${linha}\n`;
      }
      if (atual.trim().length) partes.push(`${cabecalho}\n${atual}`);
      if (!partes.length) partes.push(csv.slice(0, LIMITE));

      let importacaoId: string | null = null;
      let total = 0;
      for (let i = 0; i < partes.length; i++) {
        if (partes.length > 1) toast.info(`Processando parte ${i + 1} de ${partes.length}...`);
        const r = await importarPlanilhaNativa({
          data: {
            canal: canalEfetivo,
            mes_ref: mes,
            arquivo_nome: file.name,
            csv: partes[i],
            parte: i,
            importacao_id: importacaoId,
          },
        });
        importacaoId = r.importacao_id;
        total = r.total;
      }
      return { importacao_id: importacaoId, total };
    },
    onSuccess: (r) => {
      toast.success(`Relatório matriz importado: ${r.total} vendas.`);
      qc.invalidateQueries({ queryKey: ["contestacoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


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
          Relatório matriz importado pelo Gerente Regional. Filtre o seu nome e clique em Verificar
          para comparar com as suas vendas instaladas no mês.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="mes">Mês</Label>
            <Input id="mes" type="month" value={mes} onChange={(e) => setMes(e.target.value || mesAtual())} />
          </div>
          <div className="space-y-1.5">
            <Label>Canal</Label>
            <Select
              value={canalEfetivo}
              onValueChange={(v) => setCanal(v as "loja" | "pap")}
              disabled={!me.data?.isGestor}
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

      {me.data?.isRegional && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4" /> Planilha de contestações (relatório matriz)
            </CardTitle>
            <CardDescription>
              Exclusivo do Gerente Regional. Envie a planilha (.xlsx, .xls ou .csv) do canal{" "}
              {canalEfetivo === "pap" ? "PAP" : "Loja"} em {mes}. A IA extrai Protocolo, Vendedor,
              Classe do Protocolo, Tecnologia, Preço Novo, Preço Antigo, Diferença, Faixa e Comissão
              e substitui a importação anterior do mesmo mês.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) importar.mutate(f);
              }}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={importar.isPending}>
              <Upload className="mr-2 h-4 w-4" />
              {importar.isPending ? "Analisando planilha..." : "Anexar planilha"}
            </Button>
            {dados.data?.importacao && (
              <p className="text-xs text-muted-foreground">
                Última importação: <span className="font-medium">{dados.data.importacao.arquivo_nome}</span> —{" "}
                {dados.data.importacao.total_linhas} vendas em{" "}
                {new Date(dados.data.importacao.created_at).toLocaleString("pt-BR")}
              </p>
            )}
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
                <CardTitle className="text-base">Relatório matriz</CardTitle>
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
