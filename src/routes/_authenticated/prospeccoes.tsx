import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, Plus, Settings2, ChevronLeft, ChevronRight, ShoppingCart, Trash2, TrendingUp, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MeuScript, CopiarScript } from "@/components/meu-script";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/prospeccoes")({
  head: () => ({
    meta: [
      { title: "Prospecções · Unifique" },
      { name: "description", content: "Base de clientes para prospecção e renovação de cada consultor." },
      { property: "og:title", content: "Prospecções · Unifique" },
      { property: "og:description", content: "Base de clientes para prospecção e renovação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

let STATUS: Record<string, string> = {};
function useStatusOpcoes() {
  const q = useQuery({
    queryKey: ["prosp-status-opcoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("prospeccao_status_opcoes").select("chave, nome, ordem").order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });
  STATUS = Object.fromEntries((q.data ?? []).map((o) => [o.chave, o.nome]));
  return q;
}
function useCategorias() {
  return useQuery({
    queryKey: ["prosp-categorias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prospeccoes_categorias")
        .select("categoria")
        .order("categoria");
      if (error) throw error;
      return (data ?? []).map((r) => r.categoria).filter((c): c is string => !!c);
    },
  });
}
const POR_PAGINA = 50;
const GESTOR = ["gerente", "lider_pap", "gerente_regional", "regional", "admin"];
const norm = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

function useMe() {
  return useQuery({
    queryKey: ["prosp-me"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user!.id;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      return {
        uid,
        gestor: (roles ?? []).some((r) => GESTOR.includes(r.role)),
        master: (roles ?? []).some((r) => r.role === "admin" || r.role === "regional"),
      };
    },
  });
}

function Page() {
  const me = useMe();
  useStatusOpcoes();
  const categorias = useCategorias();
  const [aba, setAba] = useState<"base" | "hist">("base");
  const [busca, setBusca] = useState("");
  const [buscaDeb, setBuscaDeb] = useState("");
  const [status, setStatus] = useState("todos");
  const [categoria, setCategoria] = useState("todas");
  const [consultor, setConsultor] = useState("todos");
  const [pagina, setPagina] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setBuscaDeb(busca), 350);
    return () => clearTimeout(t);
  }, [busca]);
  useEffect(() => setPagina(0), [buscaDeb, status, categoria, consultor, aba]);

  const gestor = !!me.data?.gestor;

  const equipe = useQuery({
    queryKey: ["prosp-equipe", me.data?.uid],
    enabled: gestor,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, nome")
        .neq("id", me.data!.uid)
        .eq("ativo", true)
        .order("nome");
      return data ?? [];
    },
  });

  const lista = useQuery({
    queryKey: ["prospeccoes", aba, buscaDeb, status, categoria, consultor, pagina],
    enabled: !!me.data,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const tabela = aba === "base" ? "prospeccoes" : "prospeccoes_historico";
      let q = supabase
        .from(tabela)
        .select("*", { count: "exact" })
        .order(aba === "base" ? "nome_cliente" : "arquivado_em", { ascending: aba === "base" })
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
      if (!gestor) q = q.eq("vendedor_id", me.data!.uid);
      else if (consultor !== "todos") q = q.eq("vendedor_id", consultor);
      if (status === "sem") q = q.is("status", null);
      else if (status !== "todos") q = q.eq("status", status);
      // "categoria" só existe na tabela base (o histórico não tem essa coluna)
      if (aba === "base" && categoria !== "todas") q = q.eq("categoria" as never, categoria);
      if (buscaDeb.trim()) q = q.ilike("nome_cliente", `%${buscaDeb.trim()}%`);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as any[], total: count ?? 0 };
    },
  });

  const contagens = useQuery({
    queryKey: ["prosp-contagens", buscaDeb, categoria, consultor, aba],
    enabled: !!me.data && aba === "base",
    queryFn: async () => {
      const escopo = () => {
        let q = supabase.from("prospeccoes").select("id", { count: "exact", head: true });
        if (!gestor) q = q.eq("vendedor_id", me.data!.uid);
        else if (consultor !== "todos") q = q.eq("vendedor_id", consultor);
        if (categoria !== "todas") q = q.eq("categoria" as never, categoria);
        if (buscaDeb.trim()) q = q.ilike("nome_cliente", `%${buscaDeb.trim()}%`);
        return q;
      };
      const chaves = ["contato_feito", "negociando", "fechado", "sem", "com_status"] as const;
      const respostas = await Promise.all(
        chaves.map((k) => {
          let q = escopo();
          q = k === "sem" ? q.is("status", null) : k === "com_status" ? q.not("status", "is", null) : q.eq("status", k);
          return q;
        }),
      );
      const pares = chaves.map((k, i) => [k, respostas[i]!.count ?? 0] as const);
      return Object.fromEntries(pares) as Record<(typeof chaves)[number], number>;
    },
  });

  const nomePorId = Object.fromEntries((equipe.data ?? []).map((p) => [p.id, p.nome]));
  const total = lista.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const contagem = (
    k: "contato_feito" | "negociando" | "fechado" | "sem" | "com_status",
  ) => contagens.data?.[k] ?? null;
  const contatados = contagem("com_status") ?? 0;
  const ganhos = contagem("fechado") ?? 0;
  const conversao = contatados > 0 ? (ganhos / contatados) * 100 : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Prospecções</h1>
          <p className="text-sm text-muted-foreground">
            {gestor ? "Base de clientes distribuída para a sua equipe." : "Seus clientes para contato."}
          </p>
        </div>
        {!gestor && <MeuScript contexto="prospeccoes" />}
        <div className="flex flex-wrap gap-2">
          {me.data?.master && <StatusConfig />}
          {gestor && me.data && <AcoesGestor uid={me.data.uid} />}
        </div>
      </div>

      <Tabs value={aba} onValueChange={(v) => setAba(v as never)}>
        <TabsList>
          <TabsTrigger value="base">Base atual</TabsTrigger>
          <TabsTrigger value="hist">Histórico</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Buscar cliente…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-9 w-64"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="sem">Sem status</SelectItem>
            {Object.entries(STATUS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {aba === "base" && (
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="h-9 w-52"><SelectValue placeholder="Todas as categorias" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {(categorias.data ?? []).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {gestor && (
          <Select value={consultor} onValueChange={setConsultor}>
            <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os consultores</SelectItem>
              {(equipe.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{total} cliente(s)</CardTitle>
            {aba === "base" &&
              (
                [
                  ["contato_feito", "Contato Feito"],
                  ["negociando", "Negociando"],
                  ["fechado", "Fechado"],
                  ["sem", "Falta contactar"],
                ] as const
              ).map(([k, label]) => {
                const valor = contagem(k);
                const ativo = status === (k === "sem" ? "sem" : k);
                return (
                  <button
                    key={k}
                    onClick={() => setStatus(ativo ? "todos" : k)}
                    title={`Filtrar por ${label}`}
                  >
                    <Badge variant={ativo ? "default" : "outline"} className="cursor-pointer">
                      {label}: {valor ?? "…"}
                    </Badge>
                  </button>
                );
              })}
            {aba === "base" && (
              <button
                onClick={() => setStatus(status === "fechado" ? "todos" : "fechado")}
                title="Conversão: clientes fechados ÷ clientes com status alterado"
              >
                <Badge
                  variant={status === "fechado" ? "default" : "outline"}
                  className="cursor-pointer gap-1.5 whitespace-nowrap"
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  Conversão:{" "}
                  {conversao === null
                    ? "—"
                    : conversao.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + "%"}
                  <span className="font-normal opacity-75">
                    {ganhos}/{contatados}
                  </span>
                </Badge>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Button size="icon" variant="outline" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {pagina + 1} / {paginas}
            <Button size="icon" variant="outline" disabled={pagina + 1 >= paginas} onClick={() => setPagina(pagina + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {aba === "base" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {gestor && <TableHead>Consultor</TableHead>}
                  <TableHead className="w-10">Venda</TableHead>
                  <TableHead>Data contato</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Nome afetado</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Unidade Operacional</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(lista.data?.rows ?? []).map((r) => (
                  <Linha key={r.id} r={r} gestor={gestor} nome={nomePorId[r.vendedor_id]} equipe={equipe.data ?? []} />
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {gestor && <TableHead>Consultor</TableHead>}
                  <TableHead>Cliente</TableHead>
                  <TableHead>CPF/CNPJ</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Último status</TableHead>
                  <TableHead>Data última abordagem</TableHead>
                  <TableHead>OBS</TableHead>
                  <TableHead>Arquivado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(lista.data?.rows ?? []).map((r) => (
                  <TableRow key={r.id}>
                    {gestor && <TableCell>{nomePorId[r.vendedor_id] ?? "—"}</TableCell>}
                    <TableCell>{r.nome_cliente}</TableCell>
                    <TableCell>{r.cpf_cnpj ?? "—"}</TableCell>
                    <TableCell>{r.telefone ?? "—"}</TableCell>
                    <TableCell>{STATUS[r.status] ?? "—"}</TableCell>
                    <TableCell>{r.data_contato ? new Date(r.data_contato + "T00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                    <TableCell className="max-w-[260px] truncate">{r.observacao ?? "—"}</TableCell>
                    <TableCell>{new Date(r.arquivado_em).toLocaleDateString("pt-BR")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {lista.data && total === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Linha({ r, gestor, nome, equipe }: { r: any; gestor: boolean; nome?: string; equipe: { id: string; nome: string }[] }) {
  const [abrirTransf, setAbrirTransf] = useState(false);
  const qc = useQueryClient();
  const [obs, setObs] = useState(r.observacao ?? "");
  const salvar = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from("prospeccoes").update(patch as never).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prospeccoes"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <TableRow>
      {gestor && (
        <TableCell className="whitespace-nowrap">
          <div className="flex items-center gap-1">
            <span>{nome ?? "—"}</span>
            <Popover open={abrirTransf} onOpenChange={setAbrirTransf}>
              <PopoverTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7" title="Transferir para outro consultor">
                  <ArrowRightLeft className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2">
                <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">Transferir para</p>
                <div className="max-h-64 overflow-y-auto">
                  {equipe.filter((p) => p.id !== r.vendedor_id).map((p) => (
                    <button
                      key={p.id}
                      className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        salvar.mutate({ vendedor_id: p.id }, { onSuccess: () => toast.success(`Transferido para ${p.nome}.`) });
                        setAbrirTransf(false);
                      }}
                    >
                      {p.nome}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </TableCell>
      )}
      <TableCell className="whitespace-nowrap">
        <CopiarScript cliente={r.nome_cliente ?? ""} contexto="prospeccoes" />
        <Button asChild size="icon" variant="ghost" className="h-7 w-7" title="Cadastrar venda para este cliente">
          <Link
            to="/vendas/nova"
            search={{
              lead_nome: r.nome_cliente ?? undefined,
              lead_produto: r.plano ?? undefined,
              lead_whatsapp: r.telefone ?? undefined,
              lead_cidade: r.unidade ?? undefined,
            }}
          >
            <ShoppingCart className="h-4 w-4" />
          </Link>
        </Button>
      </TableCell>
      <TableCell>
        <Input
          type="date"
          className="h-8 w-36"
          defaultValue={r.data_contato ?? ""}
          onChange={(e) => salvar.mutate({ data_contato: e.target.value || null })}
        />
      </TableCell>
      <TableCell>
        <Select
          value={r.status ?? ""}
          onValueChange={(v) =>
            salvar.mutate({
              status: v,
              ...(r.data_contato ? {} : { data_contato: new Date().toLocaleDateString("en-CA") }),
            })
          }
        >
          <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Selecionar" /></SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="whitespace-nowrap">{r.nome_cliente}</TableCell>
      <TableCell className="text-xs">{r.item ?? "—"}</TableCell>
      <TableCell className="text-xs">{r.categoria ?? "—"}</TableCell>
      <TableCell className="whitespace-nowrap text-xs">
        {r.data_registro ? new Date(r.data_registro).toLocaleDateString("pt-BR") : "—"}
      </TableCell>
      <TableCell className="text-xs">{r.unidade ?? "—"}</TableCell>
      <TableCell className="max-w-[220px] truncate text-xs" title={r.plano ?? ""}>{r.plano ?? "—"}</TableCell>
      <TableCell>
        <Input
          className="h-8 w-56"
          value={obs}
          placeholder="Observação"
          onChange={(e) => setObs(e.target.value)}
          onBlur={() => obs !== (r.observacao ?? "") && salvar.mutate({ observacao: obs || null })}
        />
      </TableCell>
    </TableRow>
  );
}

function AcoesGestor({ uid }: { uid: string }) {
  const qc = useQueryClient();
  const ref = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  const [pendentes, setPendentes] = useState<Record<string, unknown>[] | null>(null);
  const [equipeImp, setEquipeImp] = useState<{ id: string; nome: string; canal: string }[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const [canalDist, setCanalDist] = useState<"loja" | "pap">("loja");
  const [qtdArquivos, setQtdArquivos] = useState(0);

  const ler = async (files: File[]) => {
    setEnviando(true);
    try {
      const XLSX = await import("xlsx");
      const linhas: Record<string, unknown>[] = [];
      for (const file of files) {
        const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
        linhas.push(...XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: null }));
      }
      setQtdArquivos(files.length);
      const { data: equipe } = await supabase.from("profiles").select("id, nome, canal").eq("gerente_id", uid).eq("ativo", true).order("nome");
      const pega = (l: Record<string, unknown>, ...ks: string[]) => {
        for (const k of Object.keys(l)) if (ks.includes(norm(k))) return l[k];
        return null;
      };
      const registros: Record<string, unknown>[] = [];
      for (const l of linhas) {
        const nome = String(pega(l, "nome afetado", "nome", "cliente", "nome do cliente") ?? "").trim();
        if (!nome) continue;
        const d = pega(l, "data");
        const txt = (k: string) => {
          const v = pega(l, k);
          return v == null || v === "" ? null : String(v);
        };
        registros.push({
          gerente_id: uid,
          nome_cliente: nome,
          cpf_cnpj: txt("cpf/cnpj"),
          telefone: txt("telefone") ?? txt("contato"),
          item: txt("item"),
          categoria: txt("categoria"),
          data_registro: d instanceof Date ? d.toISOString() : null,
          unidade: txt("unidade operacional"),
          plano: txt("plano"),
        });
      }
      if (!registros.length) throw new Error("Nenhum cliente encontrado na planilha.");
      const eq = (equipe ?? []) as { id: string; nome: string; canal: string }[];
      setEquipeImp(eq);
      setCanalDist("loja");
      setSel(new Set(eq.filter((p) => p.canal === "loja").map((p) => p.id)));
      setPendentes(registros);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
      if (ref.current) ref.current.value = "";
    }
  };

  const distribuir = async () => {
    if (!pendentes) return;
    const ids = equipeImp.filter((p) => sel.has(p.id)).map((p) => p.id);
    if (!ids.length) return toast.error("Selecione ao menos um consultor.");
    setEnviando(true);
    try {
      const regs = pendentes.map((r, i) => ({ ...r, vendedor_id: ids[i % ids.length] }));
      for (let i = 0; i < regs.length; i += 500) {
        const { error } = await supabase.from("prospeccoes").insert(regs.slice(i, i + 500) as never);
        if (error) throw error;
      }
      toast.success(`${regs.length} clientes distribuídos entre ${ids.length} consultor(es) (≈${Math.ceil(regs.length / ids.length)} cada).`);
      setPendentes(null);
      qc.invalidateQueries({ queryKey: ["prospeccoes"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  const limpar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("limpar_prospeccoes");
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast.success(`${n} clientes movidos para o histórico.`);
      qc.invalidateQueries({ queryKey: ["prospeccoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex gap-2">
      <input
        ref={ref}
        type="file"
        multiple
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => e.target.files?.length && ler(Array.from(e.target.files))}
      />
      <Button onClick={() => ref.current?.click()} disabled={enviando}>
        <Upload className="mr-2 h-4 w-4" /> {enviando ? "Enviando…" : "Anexar base(s)"}
      </Button>
      <Button
        variant="outline"
        disabled={limpar.isPending}
        onClick={() => {
          if (confirm("Limpar a base da sua equipe? Os dados da última abordagem ficam salvos no Histórico."))
            limpar.mutate();
        }}
      >
        <Trash2 className="mr-2 h-4 w-4" /> Limpar base
      </Button>
      <Dialog open={!!pendentes} onOpenChange={(o) => !o && !enviando && setPendentes(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Distribuir {pendentes?.length ?? 0} clientes{qtdArquivos > 1 ? ` (${qtdArquivos} bases)` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <p className="text-sm font-medium">Distribuir para</p>
            <Tabs
              value={canalDist}
              onValueChange={(v) => {
                const c = v as "loja" | "pap";
                setCanalDist(c);
                setSel(new Set(equipeImp.filter((p) => p.canal === c).map((p) => p.id)));
              }}
            >
              <TabsList>
                <TabsTrigger value="loja">Consultores Loja</TabsTrigger>
                <TabsTrigger value="pap">Consultores PAP</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <p className="text-sm text-muted-foreground">
            A base será dividida em quantidades iguais
            {sel.size ? ` (≈${Math.ceil((pendentes?.length ?? 0) / sel.size)} para cada)` : ""}.
          </p>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {equipeImp.filter((p) => p.canal === canalDist).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum consultor {canalDist === "loja" ? "Loja" : "PAP"} na sua equipe.</p>
            )}
            {equipeImp.filter((p) => p.canal === canalDist).map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={sel.has(p.id)}
                  onCheckedChange={(c) => {
                    const n = new Set(sel);
                    c ? n.add(p.id) : n.delete(p.id);
                    setSel(n);
                  }}
                />
                {p.nome}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendentes(null)} disabled={enviando}>Cancelar</Button>
            <Button onClick={distribuir} disabled={enviando || !sel.size}>{enviando ? "Distribuindo…" : "Distribuir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusConfig() {
  const qc = useQueryClient();
  const opcoes = useStatusOpcoes();
  const [aberto, setAberto] = useState(false);
  const [novo, setNovo] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["prosp-status-opcoes"] });
  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p;
    if (error) toast.error(error.message);
    else refresh();
  };
  const adicionar = () => {
    const nome = novo.trim();
    if (!nome) return;
    const chave = norm(nome).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") + "_" + Date.now().toString(36);
    const ordem = Math.max(0, ...(opcoes.data ?? []).map((o) => o.ordem)) + 1;
    run(supabase.from("prospeccao_status_opcoes").insert({ chave, nome, ordem }));
    setNovo("");
  };
  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        <Settings2 className="mr-2 h-4 w-4" /> Opções de status
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader><DialogTitle>Opções de status</DialogTitle></DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {(opcoes.data ?? []).map((o) => (
              <div key={o.chave} className="flex items-center gap-2">
                <Input
                  defaultValue={o.nome}
                  className="h-9"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== o.nome) run(supabase.from("prospeccao_status_opcoes").update({ nome: v }).eq("chave", o.chave));
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  title="Excluir"
                  onClick={() => confirm(`Excluir a opção "${o.nome}"?`) && run(supabase.from("prospeccao_status_opcoes").delete().eq("chave", o.chave))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input placeholder="Nova opção" value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && adicionar()} className="h-9" />
            <Button onClick={adicionar}><Plus className="mr-1 h-4 w-4" /> Incluir</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
