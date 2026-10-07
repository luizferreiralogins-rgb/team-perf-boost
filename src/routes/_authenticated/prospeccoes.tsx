import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2, Upload } from "lucide-react";
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

const STATUS: Record<string, string> = {
  contato_feito: "Contato feito",
  negociando: "Negociando",
  fechado: "Fechado",
  declinou: "Declinou",
  nao_perturbar: "Não perturbar",
  sem_whatsapp: "Sem WhatsApp",
};
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
      return { uid, gestor: (roles ?? []).some((r) => GESTOR.includes(r.role)) };
    },
  });
}

function Page() {
  const me = useMe();
  const [aba, setAba] = useState<"base" | "hist">("base");
  const [busca, setBusca] = useState("");
  const [buscaDeb, setBuscaDeb] = useState("");
  const [status, setStatus] = useState("todos");
  const [consultor, setConsultor] = useState("todos");
  const [pagina, setPagina] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setBuscaDeb(busca), 350);
    return () => clearTimeout(t);
  }, [busca]);
  useEffect(() => setPagina(0), [buscaDeb, status, consultor, aba]);

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
    queryKey: ["prospeccoes", aba, buscaDeb, status, consultor, pagina],
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
      if (buscaDeb.trim()) q = q.ilike("nome_cliente", `%${buscaDeb.trim()}%`);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as any[], total: count ?? 0 };
    },
  });

  const nomePorId = Object.fromEntries((equipe.data ?? []).map((p) => [p.id, p.nome]));
  const total = lista.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Prospecções</h1>
          <p className="text-sm text-muted-foreground">
            {gestor ? "Base de clientes distribuída para a sua equipe." : "Seus clientes para contato."}
          </p>
        </div>
        {gestor && me.data && <AcoesGestor uid={me.data.uid} />}
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{total} cliente(s)</CardTitle>
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
                  <Linha key={r.id} r={r} gestor={gestor} nome={nomePorId[r.vendedor_id]} />
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

function Linha({ r, gestor, nome }: { r: any; gestor: boolean; nome?: string }) {
  const qc = useQueryClient();
  const [obs, setObs] = useState(r.observacao ?? "");
  const salvar = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from("prospeccoes").update(patch).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prospeccoes"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <TableRow>
      {gestor && <TableCell className="whitespace-nowrap">{nome ?? "—"}</TableCell>}
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

  const importar = async (file: File) => {
    setEnviando(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: null });
      const { data: equipe } = await supabase.from("profiles").select("id, nome").eq("gerente_id", uid);
      const mapa = new Map((equipe ?? []).map((p) => [norm(p.nome), p.id]));
      const pega = (l: Record<string, unknown>, ...ks: string[]) => {
        for (const k of Object.keys(l)) if (ks.includes(norm(k))) return l[k];
        return null;
      };
      const faltando = new Map<string, number>();
      const registros: Record<string, unknown>[] = [];
      for (const l of linhas) {
        const c = String(pega(l, "consultor") ?? "").trim();
        const nome = String(pega(l, "nome afetado", "nome", "cliente", "nome do cliente") ?? "").trim();
        if (!c || !nome) continue;
        const vid = mapa.get(norm(c));
        if (!vid) {
          faltando.set(c, (faltando.get(c) ?? 0) + 1);
          continue;
        }
        const d = pega(l, "data");
        const txt = (k: string) => {
          const v = pega(l, k);
          return v == null || v === "" ? null : String(v);
        };
        registros.push({
          vendedor_id: vid,
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
      for (let i = 0; i < registros.length; i += 500) {
        const { error } = await supabase.from("prospeccoes").insert(registros.slice(i, i + 500) as never);
        if (error) throw error;
      }
      toast.success(`${registros.length} clientes distribuídos.`);
      if (faltando.size)
        toast.warning(
          `Consultores não encontrados na sua equipe: ${[...faltando].map(([n, q]) => `${n} (${q})`).join(", ")}`,
          { duration: 15000 },
        );
      qc.invalidateQueries({ queryKey: ["prospeccoes"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
      if (ref.current) ref.current.value = "";
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
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])}
      />
      <Button onClick={() => ref.current?.click()} disabled={enviando}>
        <Upload className="mr-2 h-4 w-4" /> {enviando ? "Enviando…" : "Anexar planilha"}
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
    </div>
  );
}
