import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, ShoppingCart, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/indique-ganhe")({
  head: () => ({
    meta: [
      { title: "Gestão Indique Ganhe — Uni4Consult" },
      { name: "description", content: "Cadastre e acompanhe as indicações do Indique Ganhe." },
      { property: "og:title", content: "Gestão Indique Ganhe — Uni4Consult" },
      { property: "og:description", content: "Cadastre e acompanhe as indicações do Indique Ganhe." },
    ],
  }),
  component: IndiqueGanhe,
});

const STATUS = [
  { v: "contato_feito", l: "Contato feito" },
  { v: "negociando", l: "Negociando" },
  { v: "contratou", l: "Contratou à instalar" },
  { v: "instalado", l: "Instalado" },
] as const;
const statusLabel = (v: string) => STATUS.find((s) => s.v === v)?.l ?? v;

type Hist = { status: string; em: string };
type Indicacao = {
  id: string;
  vendedor_id: string;
  cliente_nome: string;
  cliente_cpf: string;
  indicado_nome: string;
  indicado_celular: string;
  indicado_email: string | null;
  status: string;
  historico: Hist[];
  created_at: string;
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const schema = z.object({
  cliente_nome: z.string().trim().min(3, "Informe o nome completo do cliente").max(150),
  cliente_cpf: z.string().trim().regex(/^\d{11}$/, "CPF deve ter 11 números"),
  indicado_nome: z.string().trim().min(3, "Informe o nome completo do indicado").max(150),
  indicado_celular: z.string().trim().regex(/^\d{10,11}$/, "Celular deve ter DDD + número"),
  indicado_email: z.string().trim().email("E-mail inválido").max(255).or(z.literal("")),
});

function resumo(i: Indicacao) {
  const linhas = [
    `Indique Ganhe — indicado por ${i.cliente_nome} (CPF ${i.cliente_cpf}) em ${fmt(i.created_at)}.`,
    `Indicado: ${i.indicado_nome} | Celular: ${i.indicado_celular}${i.indicado_email ? ` | E-mail: ${i.indicado_email}` : ""}.`,
    ...(i.historico ?? []).map((h) => `${fmt(h.em)} — ${statusLabel(h.status)}`),
    "Não esqueça de acompanhar o desconto de 50% na primeira mensalidade desse cliente e após o pagamento, o desconto de 100% na fatura do cliente que fez a indicação.",
  ];
  return linhas.join("\n");
}

function IndiqueGanhe() {
  const qc = useQueryClient();
  const { data: ctx } = useQuery({
    queryKey: ["indique-ctx"],
    queryFn: async () => {
      const { data: s } = await supabase.auth.getUser();
      const uid = s.user!.id;
      const [{ data: roles }, { data: canais }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("opcoes_canais").select("nome").eq("tipo", "venda"),
      ]);
      const r = (roles ?? []).map((x) => x.role as string);
      const canal = (canais ?? []).find((c) => /indique/i.test(c.nome))?.nome ?? "Indique Ganhe";
      return { uid, gestor: r.some((x) => x !== "consultor"), canal };
    },
  });
  const { data: lista = [] } = useQuery({
    queryKey: ["indicacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("indicacoes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Indicacao[];
    },
  });
  const { data: nomes = {} } = useQuery({
    queryKey: ["indicacoes-nomes", lista.map((l) => l.vendedor_id).join()],
    enabled: !!ctx?.gestor && lista.length > 0,
    queryFn: async () => {
      const ids = [...new Set(lista.map((l) => l.vendedor_id))];
      const { data } = await supabase.from("profiles").select("id, nome").in("id", ids);
      return Object.fromEntries((data ?? []).map((p) => [p.id, p.nome])) as Record<string, string>;
    },
  });

  const [ver, setVer] = useState<Indicacao | null>(null);
  const [fStatus, setFStatus] = useState("todos");
  const [fCons, setFCons] = useState("todos");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const filtrada = useMemo(
    () =>
      lista.filter((i) => {
        const d = i.created_at.slice(0, 10);
        return (
          (fStatus === "todos" || i.status === fStatus) &&
          (fCons === "todos" || i.vendedor_id === fCons) &&
          (!de || d >= de) &&
          (!ate || d <= ate)
        );
      }),
    [lista, fStatus, fCons, de, ate],
  );

  const refresh = () => qc.invalidateQueries({ queryKey: ["indicacoes"] });

  async function mudarStatus(i: Indicacao, status: string) {
    const historico = [...(i.historico ?? []), { status, em: new Date().toISOString() }];
    const { error } = await supabase.from("indicacoes").update({ status, historico }).eq("id", i.id);
    if (error) return toast.error(error.message);
    refresh();
  }
  async function excluir(i: Indicacao) {
    if (!window.confirm(`Excluir a indicação de ${i.indicado_nome}?`)) return;
    const { error } = await supabase.from("indicacoes").delete().eq("id", i.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  const gestor = !!ctx?.gestor;
  const contagem = STATUS.map((s) => ({ ...s, n: filtrada.filter((i) => i.status === s.v).length }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Gestão Indique Ganhe</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {gestor ? "Consolidado das indicações da sua equipe." : "Cadastre e acompanhe suas indicações."}
        </p>
      </div>

      {ctx && !gestor && <NovaIndicacao onSaved={refresh} />}

      <Card>
        <CardHeader>
          <CardTitle>Indicações ({filtrada.length})</CardTitle>
          <div className="flex flex-wrap gap-2 pt-2">
            {contagem.map((c) => (
              <Badge key={c.v} variant="secondary">{c.l}: {c.n}</Badge>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3 pt-3">
            <div>
              <Label>Status</Label>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {STATUS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {gestor && (
              <div>
                <Label>Consultor</Label>
                <Select value={fCons} onValueChange={setFCons}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {Object.entries(nomes).sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => (
                      <SelectItem key={id} value={id}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div><Label>De</Label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
            <div><Label>Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="p-2">Data</th>
                {gestor && <th className="p-2">Consultor</th>}
                <th className="p-2">Cliente (indicou)</th>
                <th className="p-2">Indicado</th>
                <th className="p-2">Celular</th>
                <th className="p-2">E-mail</th>
                <th className="p-2">Status</th>
                <th className="p-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrada.map((i) => (
                <tr key={i.id} className="border-b">
                  <td className="p-2 whitespace-nowrap">{fmt(i.created_at)}</td>
                  {gestor && <td className="p-2">{nomes[i.vendedor_id] ?? "—"}</td>}
                  <td className="p-2">{i.cliente_nome}<div className="text-xs text-muted-foreground">CPF {i.cliente_cpf}</div></td>
                  <td className="p-2">{i.indicado_nome}</td>
                  <td className="p-2">{i.indicado_celular}</td>
                  <td className="p-2">{i.indicado_email ?? "—"}</td>
                  <td className="p-2">
                    {i.vendedor_id === ctx?.uid ? (
                      <Select value={i.status} onValueChange={(v) => mudarStatus(i, v)}>
                        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{statusLabel(i.status)}</Badge>
                    )}
                  </td>
                  <td className="p-2">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" title="Ver registro" onClick={() => setVer(i)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {i.vendedor_id === ctx?.uid && (
                        <>
                          <Button size="icon" variant="ghost" title="Cadastrar venda" asChild>
                            <Link
                              to="/vendas/nova"
                              search={{
                                lead_nome: i.indicado_nome,
                                lead_whatsapp: i.indicado_celular,
                                lead_canal: ctx.canal,
                                lead_obs: resumo(i),
                              }}
                            >
                              <ShoppingCart className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button size="icon" variant="ghost" title="Excluir" onClick={() => excluir(i)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtrada.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Nenhuma indicação.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!ver} onOpenChange={(o) => !o && setVer(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registro de indicação</DialogTitle></DialogHeader>
          {ver && (
            <div className="space-y-3 text-sm">
              {gestor && <p><b>Consultor:</b> {nomes[ver.vendedor_id] ?? "—"}</p>}
              <p><b>Cliente que indicou:</b> {ver.cliente_nome} — CPF {ver.cliente_cpf}</p>
              <p><b>Indicado:</b> {ver.indicado_nome}</p>
              <p><b>Celular:</b> {ver.indicado_celular} · <b>E-mail:</b> {ver.indicado_email ?? "—"}</p>
              <p><b>Status atual:</b> {statusLabel(ver.status)}</p>
              <div>
                <b>Histórico</b>
                <ul className="mt-1 list-disc pl-5">
                  <li>{fmt(ver.created_at)} — Indicação registrada</li>
                  {(ver.historico ?? []).map((h, k) => <li key={k}>{fmt(h.em)} — {statusLabel(h.status)}</li>)}
                </ul>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NovaIndicacao({ onSaved }: { onSaved: () => void }) {
  const vazio = { cliente_nome: "", cliente_cpf: "", indicado_nome: "", indicado_celular: "", indicado_email: "" };
  const [f, setF] = useState(vazio);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof vazio) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const p = schema.safeParse({
      ...f,
      cliente_cpf: f.cliente_cpf.replace(/\D/g, ""),
      indicado_celular: f.indicado_celular.replace(/\D/g, ""),
    });
    if (!p.success) return toast.error(p.error.issues[0].message);
    setSaving(true);
    const agora = new Date().toISOString();
    const { error } = await supabase.from("indicacoes").insert({
      ...p.data,
      indicado_email: p.data.indicado_email || null,
      status: "contato_feito",
      historico: [{ status: "contato_feito", em: agora }],
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Indicação cadastrada.");
    setF(vazio);
    onSaved();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nova indicação</CardTitle>
        <CardDescription>Dados de quem indicou e da pessoa indicada.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2">
          <div><Label>Nome completo do cliente</Label><Input value={f.cliente_nome} onChange={set("cliente_nome")} maxLength={150} /></div>
          <div><Label>CPF do cliente</Label><Input value={f.cliente_cpf} onChange={set("cliente_cpf")} maxLength={14} placeholder="000.000.000-00" /></div>
          <div><Label>Nome completo do indicado</Label><Input value={f.indicado_nome} onChange={set("indicado_nome")} maxLength={150} /></div>
          <div><Label>Celular do indicado</Label><Input type="tel" value={f.indicado_celular} onChange={set("indicado_celular")} maxLength={20} placeholder="(47) 99999-9999" /></div>
          <div className="sm:col-span-2"><Label>E-mail do indicado</Label><Input type="email" value={f.indicado_email} onChange={set("indicado_email")} maxLength={255} /></div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Cadastrar indicação"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
