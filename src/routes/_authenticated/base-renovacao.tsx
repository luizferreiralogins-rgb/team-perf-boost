import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Upload, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEquipe } from "@/components/dashboard/filtros-ranking";

export const Route = createFileRoute("/_authenticated/base-renovacao")({
  head: () => ({
    meta: [
      { title: "Base renovação — Unifique Comercial" },
      { name: "description", content: "Clientes da base para contato de renovação." },
      { property: "og:title", content: "Base renovação — Unifique Comercial" },
      { property: "og:description", content: "Clientes da base para contato de renovação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BaseRenovacao,
});

const STATUS: Record<string, string> = {
  contato_feito: "Contato feito",
  negociando: "Negociando",
  fechado: "Fechado",
  declinou: "Declinou",
  nao_perturbar: "Não perturbar",
  sem_whatsapp: "Sem WhatsApp",
};
const POR_PAGINA = 100;

type Linha = {
  id: string;
  consultor_id: string;
  gerente_id: string;
  status: string | null;
  data_contato: string | null;
  nome_cliente: string;
  cidade: string | null;
  telefone: string | null;
  plano: string | null;
  valor: number | null;
  velox: string | null;
  tipo_pessoa: string | null;
  cpf_cnpj: string | null;
  obs: string | null;
};

const chave = (s: string) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .split(/\s+/)[0]
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

async function buscarTudo<T>(tabela: "base_renovacao" | "base_renovacao_historico", order: string) {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from(tabela)
      .select("*")
      .order(order)
      .range(de, de + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function BaseRenovacao() {
  const me = useQuery({
    queryKey: ["me-base-renov"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user!.id;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const rs = (roles ?? []).map((r) => r.role as string);
      const role =
        ["admin", "regional", "gerente_regional", "gerente", "lider_pap"].find((r) => rs.includes(r)) ??
        "consultor";
      return { uid, role, isGestor: role !== "consultor" };
    },
  });
  const equipe = useEquipe(me.data?.uid, me.data?.isGestor ? me.data.role : undefined);
  const nomes = useMemo(
    () => new Map((equipe.data ?? []).map((m) => [m.id, m.nome])),
    [equipe.data],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Base renovação</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Clientes da base para contato e tentativa de renovação.
        </p>
      </div>
      {me.data?.isGestor && <Importar uid={me.data.uid} equipe={equipe.data ?? []} />}
      <Tabs defaultValue="base">
        <TabsList>
          <TabsTrigger value="base">Base atual</TabsTrigger>
          <TabsTrigger value="hist">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="base">
          <Lista isGestor={!!me.data?.isGestor} nomes={nomes} />
        </TabsContent>
        <TabsContent value="hist">
          <Historico nomes={nomes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Importar({ uid, equipe }: { uid: string; equipe: { id: string; nome: string }[] }) {
  const qc = useQueryClient();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");

  async function importar(file: File) {
    try {
      setBusy("Lendo planilha...");
      const wb = XLSX.read(await file.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], {
        defval: "",
      });
      const palavras = (n: string) => n.split(/\s+/).map(chave).filter(Boolean);
      const cache = new Map<string, string | undefined>();
      const achar = (c: string) => {
        const k = chave(c);
        if (!k) return undefined;
        if (cache.has(k)) return cache.get(k);
        const tenta = (f: (m: { nome: string }) => boolean) => {
          const r = equipe.filter(f);
          return r.length === 1 ? r[0].id : undefined;
        };
        const id =
          tenta((m) => palavras(m.nome)[0] === k) ??
          tenta((m) => (palavras(m.nome)[0] ?? "").startsWith(k)) ??
          tenta((m) => palavras(m.nome).some((w) => w.startsWith(k)));
        cache.set(k, id);
        return id;
      };
      const get = (r: Record<string, unknown>, ...ks: string[]) => {
        for (const k of Object.keys(r)) {
          const n = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
          if (ks.some((x) => n.startsWith(x))) {
            const v = r[k];
            if (v !== "" && v != null) return String(v).trim();
          }
        }
        return "";
      };
      const semDono = new Set<string>();
      const linhas = [];
      for (const r of rows) {
        const cons = get(r, "consultor");
        const nome = get(r, "nome do cliente", "nome");
        if (!nome) continue;
        const cid = achar(cons);
        if (!cid) {
          semDono.add(cons || "(vazio)");
          continue;
        }
        const valor = Number(String(get(r, "preco total", "valor")).replace(/[^\d,.-]/g, "").replace(",", "."));
        linhas.push({
          gerente_id: uid,
          consultor_id: cid,
          nome_cliente: nome,
          cidade: get(r, "cidade") || null,
          telefone: get(r, "telefone") || null,
          plano: get(r, "plano") || null,
          valor: Number.isFinite(valor) ? valor : null,
          velox: get(r, "velox") || null,
          tipo_pessoa: get(r, "pf ou pj", "tipo pessoa") || (Object.keys(r).some((k) => k.trim() === "Tipo") ? String(r["Tipo"] ?? "") || null : null),
          cpf_cnpj: get(r, "cpf") || null,
          obs: get(r, "obs") || null,
        });
      }
      if (!linhas.length) throw new Error("Nenhum cliente reconhecido para os consultores da sua equipe.");
      for (let i = 0; i < linhas.length; i += 1000) {
        setBusy(`Enviando ${Math.min(i + 1000, linhas.length)} de ${linhas.length}...`);
        const { error } = await supabase.from("base_renovacao").insert(linhas.slice(i, i + 1000));
        if (error) throw error;
      }
      toast.success(`${linhas.length} clientes distribuídos.`);
      if (semDono.size)
        toast.warning(`Consultores não encontrados na sua equipe: ${[...semDono].join(", ")}`, { duration: 10000 });
      qc.invalidateQueries({ queryKey: ["base-renov"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao importar.");
    } finally {
      setBusy("");
      if (ref.current) ref.current.value = "";
    }
  }

  async function limpar() {
    if (!window.confirm("Zerar a base atual? Os contatos ficam guardados no Histórico.")) return;
    setBusy("Limpando...");
    const { data, error } = await supabase.rpc("limpar_base_renovacao");
    setBusy("");
    if (error) return toast.error(error.message);
    toast.success(`${data ?? 0} clientes movidos para o histórico.`);
    qc.invalidateQueries({ queryKey: ["base-renov"] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Base do mês</CardTitle>
        <CardDescription>
          Anexe a planilha (colunas Consultor, Nome do Cliente, CPF/CNPJ, Telefone, Plano...). Cada cliente
          vai para o consultor com o mesmo primeiro nome na sua equipe.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <input
          ref={ref}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])}
        />
        <Button onClick={() => ref.current?.click()} disabled={!!busy}>
          <Upload className="mr-2 h-4 w-4" /> Anexar planilha
        </Button>
        <Button variant="outline" onClick={limpar} disabled={!!busy}>
          <Trash2 className="mr-2 h-4 w-4" /> Limpar base
        </Button>
        {busy && <span className="text-sm text-muted-foreground">{busy}</span>}
      </CardContent>
    </Card>
  );
}

function Lista({ isGestor, nomes }: { isGestor: boolean; nomes: Map<string, string> }) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["base-renov"],
    queryFn: () => buscarTudo<Linha>("base_renovacao", "created_at"),
  });
  const [busca, setBusca] = useState("");
  const [fStatus, setFStatus] = useState("all");
  const [fCons, setFCons] = useState("all");
  const [pag, setPag] = useState(0);

  const consultores = useMemo(
    () => [...new Set(data.map((d) => d.consultor_id))].map((id) => ({ id, nome: nomes.get(id) ?? "Eu" })),
    [data, nomes],
  );
  const filtrado = useMemo(() => {
    const q = busca.toLowerCase().trim();
    return data.filter(
      (d) =>
        (fCons === "all" || d.consultor_id === fCons) &&
        (fStatus === "all" || (fStatus === "sem" ? !d.status : d.status === fStatus)) &&
        (!q || [d.nome_cliente, d.cpf_cnpj, d.telefone, d.cidade].some((x) => x?.toLowerCase().includes(q))),
    );
  }, [data, busca, fStatus, fCons]);
  const paginas = Math.max(1, Math.ceil(filtrado.length / POR_PAGINA));
  const pagina = filtrado.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA);

  async function salvar(id: string, patch: Partial<Linha>) {
    qc.setQueryData<Linha[]>(["base-renov"], (old) => old?.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const { error } = await supabase.from("base_renovacao").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  }

  const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Buscar cliente, CPF, telefone..." value={busca} onChange={(e) => { setBusca(e.target.value); setPag(0); }} className="max-w-xs" />
          <select className={sel} value={fStatus} onChange={(e) => { setFStatus(e.target.value); setPag(0); }}>
            <option value="all">Todos os status</option>
            <option value="sem">Sem contato</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {isGestor && (
            <select className={sel} value={fCons} onChange={(e) => { setFCons(e.target.value); setPag(0); }}>
              <option value="all">Todos os consultores</option>
              {consultores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          )}
          <span className="ml-auto self-center text-sm text-muted-foreground">{filtrado.length} clientes</span>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                {["Consultor", "Status", "Data do contato", "Nome do cliente", "Cidade", "Telefone", "Plano", "Valor", "Velox", "PF ou PJ", "CPF/CNPJ", "OBS"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={12} className="p-4 text-center text-muted-foreground">Carregando...</td></tr>}
              {!isLoading && !pagina.length && <tr><td colSpan={12} className="p-4 text-center text-muted-foreground">Nenhum cliente na base.</td></tr>}
              {pagina.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="px-2 py-1 whitespace-nowrap">{nomes.get(l.consultor_id) ?? "Eu"}</td>
                  <td className="px-2 py-1">
                    <select className={sel} value={l.status ?? ""} onChange={(e) => salvar(l.id, { status: e.target.value || null })}>
                      <option value="">—</option>
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <Input type="date" className="h-9 w-36" value={l.data_contato ?? ""} onChange={(e) => salvar(l.id, { data_contato: e.target.value || null })} />
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap">{l.nome_cliente}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{l.cidade}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{l.telefone}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{l.plano}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{l.valor != null ? l.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : ""}</td>
                  <td className="px-2 py-1">{l.velox}</td>
                  <td className="px-2 py-1">{l.tipo_pessoa}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{l.cpf_cnpj}</td>
                  <td className="px-2 py-1">
                    <Input className="h-9 min-w-48" defaultValue={l.obs ?? ""} onBlur={(e) => e.target.value !== (l.obs ?? "") && salvar(l.id, { obs: e.target.value || null })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={pag === 0} onClick={() => setPag(pag - 1)}>Anterior</Button>
          <span className="text-sm">Página {pag + 1} de {paginas}</span>
          <Button variant="outline" size="sm" disabled={pag + 1 >= paginas} onClick={() => setPag(pag + 1)}>Próxima</Button>
        </div>
      </CardContent>
    </Card>
  );
}

type Hist = { id: string; consultor_id: string; nome_cliente: string; cpf_cnpj: string | null; telefone: string | null; status: string | null; data_contato: string | null; obs: string | null; arquivado_em: string };

function Historico({ nomes }: { nomes: Map<string, string> }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["base-renov", "hist"],
    queryFn: () => buscarTudo<Hist>("base_renovacao_historico", "arquivado_em"),
  });
  const [busca, setBusca] = useState("");
  const q = busca.toLowerCase().trim();
  const lista = (q ? data.filter((d) => [d.nome_cliente, d.cpf_cnpj, d.telefone].some((x) => x?.toLowerCase().includes(q))) : data).slice(0, 300);
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <Input placeholder="Buscar cliente, CPF, telefone..." value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>{["Consultor", "Nome do cliente", "CPF/CNPJ", "Contato", "Status da última abordagem", "Data da última abordagem", "OBS"].map((h) => <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Carregando...</td></tr>}
              {!isLoading && !lista.length && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Sem histórico.</td></tr>}
              {lista.map((h) => (
                <tr key={h.id} className="border-t">
                  <td className="px-2 py-1">{nomes.get(h.consultor_id) ?? "Eu"}</td>
                  <td className="px-2 py-1">{h.nome_cliente}</td>
                  <td className="px-2 py-1">{h.cpf_cnpj}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{h.telefone}</td>
                  <td className="px-2 py-1">{h.status ? STATUS[h.status] : "Sem contato"}</td>
                  <td className="px-2 py-1">{h.data_contato ? h.data_contato.split("-").reverse().join("/") : "—"}</td>
                  <td className="px-2 py-1">{h.obs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.length > 300 && !q && <p className="text-xs text-muted-foreground">Mostrando 300 de {data.length}. Use a busca para encontrar um cliente.</p>}
      </CardContent>
    </Card>
  );
}
