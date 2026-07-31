import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";
import { importarPlanilhaNativa } from "@/lib/contestacao.functions";
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
          "Compare as vendas do sistema nativo com as vendas cadastradas pelos consultores e identifique divergências do mês.",
      },
      { property: "og:title", content: "Contestações — Unifique Comercial" },
      {
        property: "og:description",
        content: "Cruzamento automático entre planilha do sistema nativo e vendas dos consultores.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Contestacoes,
});

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mesAtual = () => new Date().toISOString().slice(0, 7);

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const normProt = (s: string | null | undefined) => (s ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

type VendaConsultor = {
  id: string;
  protocolo: string | null;
  cliente: string;
  valor: number;
  data: string | null;
  vendedor_id: string;
  vendedor_nome: string;
};

function Contestacoes() {
  const qc = useQueryClient();
  const [mes, setMes] = useState(mesAtual());
  const [canal, setCanal] = useState<"loja" | "pap">("loja");
  const [consultor, setConsultor] = useState("todos");
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
          .select("id, protocolo, nome_cliente, consultor_nome, valor, data_instalacao")
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

      let vendas: VendaConsultor[] = [];
      if (canalEfetivo === "loja") {
        const { data: rows } = await supabase
          .from("vendas_loja")
          .select("id, protocolo, nome_cliente, valor_novo, data_ativacao, vendedor_id")
          .eq("status", "instalado")
          .gte("data_ativacao", inicio)
          .lte("data_ativacao", fim)
          .limit(5000);
        vendas = (rows ?? []).map((v) => ({
          id: v.id,
          protocolo: v.protocolo,
          cliente: v.nome_cliente,
          valor: Number(v.valor_novo ?? 0),
          data: v.data_ativacao,
          vendedor_id: v.vendedor_id,
          vendedor_nome: "",
        }));
      } else {
        const { data: rows } = await supabase
          .from("vendas_pap")
          .select("id, protocolo, nome_cliente, valor, data_ativacao, vendedor_id")
          .eq("status", "instalado")
          .gte("data_ativacao", inicio)
          .lte("data_ativacao", fim)
          .limit(5000);
        vendas = (rows ?? []).map((v) => ({
          id: v.id,
          protocolo: v.protocolo,
          cliente: v.nome_cliente,
          valor: Number(v.valor ?? 0),
          data: v.data_ativacao,
          vendedor_id: v.vendedor_id,
          vendedor_nome: "",
        }));
      }

      const ids = [...new Set(vendas.map((v) => v.vendedor_id))];
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", ids);
        const map = new Map((profs ?? []).map((p) => [p.id, p.nome]));
        vendas = vendas.map((v) => ({ ...v, vendedor_nome: map.get(v.vendedor_id) ?? "—" }));
      }

      return { nativas: nativas ?? [], vendas, importacao };
    },
  });

  const comparacao = useMemo(() => {
    const nativas = dados.data?.nativas ?? [];
    const vendas = dados.data?.vendas ?? [];

    const filtro = me.data?.isGestor ? consultor : (me.data?.nome ?? "todos");
    const alvo = filtro === "todos" ? null : norm(filtro);
    const nativasF = alvo ? nativas.filter((n) => norm(n.consultor_nome).includes(alvo)) : nativas;
    const vendasF = alvo ? vendas.filter((v) => norm(v.vendedor_nome).includes(alvo)) : vendas;

    const protVendas = new Set(vendas.map((v) => normProt(v.protocolo)).filter(Boolean));
    const nomeVendas = new Set(vendas.map((v) => norm(v.cliente)).filter(Boolean));
    const protNativas = new Set(nativas.map((n) => normProt(n.protocolo)).filter(Boolean));
    const nomeNativas = new Set(nativas.map((n) => norm(n.nome_cliente)).filter(Boolean));

    const soNativo = nativasF.filter(
      (n) =>
        !(normProt(n.protocolo) && protVendas.has(normProt(n.protocolo))) &&
        !nomeVendas.has(norm(n.nome_cliente)),
    );
    const soConsultor = vendasF.filter(
      (v) =>
        !(normProt(v.protocolo) && protNativas.has(normProt(v.protocolo))) &&
        !nomeNativas.has(norm(v.cliente)),
    );
    const conciliadas = vendasF.length - soConsultor.length;

    return { soNativo, soConsultor, conciliadas, totalNativo: nativasF.length, totalConsultor: vendasF.length };
  }, [dados.data, consultor, me.data]);

  const consultores = useMemo(() => {
    const set = new Set<string>();
    (dados.data?.vendas ?? []).forEach((v) => v.vendedor_nome && set.add(v.vendedor_nome));
    (dados.data?.nativas ?? []).forEach((n) => n.consultor_nome && set.add(n.consultor_nome));
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [dados.data]);

  const importar = useMutation({
    mutationFn: async (file: File) => {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("A planilha está vazia.");
      const csv = XLSX.utils.sheet_to_csv(ws, { dateNF: "yyyy-mm-dd" });
      if (csv.trim().length < 10) throw new Error("Não foi possível ler o conteúdo da planilha.");
      return importarPlanilhaNativa({
        data: { canal: canalEfetivo, mes_ref: mes, arquivo_nome: file.name, csv },
      });
    },
    onSuccess: (r) => {
      toast.success(`Planilha importada: ${r.total} vendas reconhecidas.`);
      qc.invalidateQueries({ queryKey: ["contestacoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Contestações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cruzamento entre as vendas reconhecidas pelo sistema nativo e as vendas instaladas
          cadastradas pelos consultores no mês selecionado.
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
          <div className="space-y-1.5">
            <Label>Consultor</Label>
            <Select value={consultor} onValueChange={setConsultor}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {me.data?.nome && !consultores.includes(me.data.nome) && (
                  <SelectItem value={me.data.nome}>{me.data.nome}</SelectItem>
                )}
                {consultores.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {me.data?.isGestor && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4" /> Planilha do sistema nativo
            </CardTitle>
            <CardDescription>
              Envie a planilha (.xlsx, .xls ou .csv) com as vendas reconhecidas do canal{" "}
              {canalEfetivo === "pap" ? "PAP" : "Loja"} em {mes}. A IA identifica as colunas
              automaticamente e substitui a importação anterior do mesmo mês.
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
          <div className="grid gap-4 sm:grid-cols-3">
            <Kpi titulo="Sistema nativo" valor={comparacao.totalNativo} />
            <Kpi titulo="Cadastradas pelos consultores" valor={comparacao.totalConsultor} />
            <Kpi titulo="Conciliadas" valor={comparacao.conciliadas} tom="ok" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                No sistema nativo e sem registro do consultor
                <Badge variant="destructive">{comparacao.soNativo.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {comparacao.soNativo.length === 0 ? (
                <Vazio texto="Nenhuma divergência: todas as vendas do sistema nativo têm registro do consultor." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Protocolo</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Consultor</TableHead>
                      <TableHead>Instalação</TableHead>
                      <TableHead>Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparacao.soNativo.map((n) => (
                      <TableRow key={n.id}>
                        <TableCell className="whitespace-nowrap">{n.protocolo ?? "—"}</TableCell>
                        <TableCell>{n.nome_cliente}</TableCell>
                        <TableCell>{n.consultor_nome ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {n.data_instalacao
                            ? new Date(`${n.data_instalacao}T00:00:00`).toLocaleDateString("pt-BR")
                            : "—"}
                        </TableCell>
                        <TableCell>{brl(Number(n.valor ?? 0))}</TableCell>
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
                Cadastradas pelo consultor e ausentes no sistema nativo
                <Badge variant="destructive">{comparacao.soConsultor.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {comparacao.soConsultor.length === 0 ? (
                <Vazio texto="Nenhuma divergência: todas as vendas dos consultores constam no sistema nativo." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Protocolo</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Consultor</TableHead>
                      <TableHead>Instalação</TableHead>
                      <TableHead>Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparacao.soConsultor.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="whitespace-nowrap">{v.protocolo ?? "—"}</TableCell>
                        <TableCell>{v.cliente}</TableCell>
                        <TableCell>{v.vendedor_nome}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {v.data ? new Date(`${v.data}T00:00:00`).toLocaleDateString("pt-BR") : "—"}
                        </TableCell>
                        <TableCell>{brl(v.valor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
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
