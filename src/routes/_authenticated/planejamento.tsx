import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Settings2, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/planejamento")({
  component: PlanejamentoPage,
  head: () => ({
    meta: [
      { title: "Planejamento PAP | Unifique" },
      {
        name: "description",
        content:
          "Planejamento de ações do time PAP: tipo de ação, cidade, local, consultores, leads e fechamentos.",
      },
      { property: "og:title", content: "Planejamento PAP | Unifique" },
      {
        property: "og:description",
        content: "Registro e acompanhamento das ações planejadas pelo Líder PAP.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Campo = "tipo_acao" | "cidade" | "local" | "consultor";

type Opcao = { id: string; campo: Campo; valor: string; lider_id: string };

type Acao = {
  id: string;
  lider_id: string;
  data: string;
  tipo_acao: string | null;
  cidade: string | null;
  local: string | null;
  consultores: string | null;
  leads: number | null;
  fechado_bl: number | null;
  fechado_movel: number | null;
  obs: string | null;
};

const CAMPOS: { key: Campo; label: string }[] = [
  { key: "tipo_acao", label: "Tipo de Ação" },
  { key: "cidade", label: "Cidade" },
  { key: "local", label: "Local (Bairro/Condomínio)" },
  { key: "consultor", label: "Consultores" },
];

const vazio = () => ({
  data: new Date().toISOString().slice(0, 10),
  tipo_acao: "",
  cidade: "",
  local: "",
  consultores: "",
  leads: "",
  fechado_bl: "",
  fechado_movel: "",
  obs: "",
});

function useMe() {
  return useQuery({
    queryKey: ["me-planejamento"],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) return null;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid);
      return { uid, roles: (roles ?? []).map((r) => r.role as string) };
    },
    staleTime: 60_000,
  });
}

function PlanejamentoPage() {
  const qc = useQueryClient();
  const me = useMe();
  const uid = me.data?.uid;
  const isLider = !!me.data?.roles.includes("lider_pap");

  const opcoes = useQuery({
    queryKey: ["planejamento-opcoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planejamento_opcoes")
        .select("id, campo, valor, lider_id")
        .order("valor");
      if (error) throw error;
      return (data ?? []) as Opcao[];
    },
  });

  const acoes = useQuery({
    queryKey: ["planejamento-acoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planejamento_acoes")
        .select(
          "id, lider_id, data, tipo_acao, cidade, local, consultores, leads, fechado_bl, fechado_movel, obs",
        )
        .order("data", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Acao[];
    },
  });

  const [aberto, setAberto] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(vazio());

  const salvar = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error("Sessão expirada.");
      if (!form.data) throw new Error("Informe a data.");
      const payload = {
        lider_id: uid,
        data: form.data,
        tipo_acao: form.tipo_acao || null,
        cidade: form.cidade || null,
        local: form.local || null,
        consultores: form.consultores || null,
        leads: form.leads === "" ? null : Number(form.leads),
        fechado_bl: form.fechado_bl === "" ? null : Number(form.fechado_bl),
        fechado_movel: form.fechado_movel === "" ? null : Number(form.fechado_movel),
        obs: form.obs || null,
      };
      const { error } = editId
        ? await supabase.from("planejamento_acoes").update(payload).eq("id", editId)
        : await supabase.from("planejamento_acoes").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editId ? "Ação atualizada." : "Ação registrada.");
      setAberto(false);
      setEditId(null);
      setForm(vazio());
      qc.invalidateQueries({ queryKey: ["planejamento-acoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("planejamento_acoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ação excluída.");
      qc.invalidateQueries({ queryKey: ["planejamento-acoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const listaDe = (campo: Campo) =>
    (opcoes.data ?? []).filter((o) => o.campo === campo).map((o) => o.valor);

  const linhas = acoes.data ?? [];
  const totais = useMemo(
    () => ({
      leads: linhas.reduce((s, l) => s + (l.leads ?? 0), 0),
      bl: linhas.reduce((s, l) => s + (l.fechado_bl ?? 0), 0),
      movel: linhas.reduce((s, l) => s + (l.fechado_movel ?? 0), 0),
    }),
    [linhas],
  );

  const abrirNova = () => {
    setEditId(null);
    setForm(vazio());
    setAberto(true);
  };
  const abrirEdicao = (a: Acao) => {
    setEditId(a.id);
    setForm({
      data: a.data,
      tipo_acao: a.tipo_acao ?? "",
      cidade: a.cidade ?? "",
      local: a.local ?? "",
      consultores: a.consultores ?? "",
      leads: a.leads == null ? "" : String(a.leads),
      fechado_bl: a.fechado_bl == null ? "" : String(a.fechado_bl),
      fechado_movel: a.fechado_movel == null ? "" : String(a.fechado_movel),
      obs: a.obs ?? "",
    });
    setAberto(true);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold">Planejamento</h1>
            <p className="text-sm text-muted-foreground">
              {isLider
                ? "Registre as ações do time PAP."
                : "Planejamento de ações registrado pelo Líder PAP."}
            </p>
          </div>
          {isLider && (
            <div className="ml-auto flex gap-2">
              <OpcoesDialog uid={uid} opcoes={opcoes.data ?? []} />
              <Button onClick={abrirNova}>
                <Plus className="mr-2 h-4 w-4" /> Nova ação
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Kpi titulo="Leads" valor={totais.leads} />
          <Kpi titulo="Fechado BL" valor={totais.bl} />
          <Kpi titulo="Fechado Móvel" valor={totais.movel} />
        </div>

        <Card>
          <CardContent className="p-0">
            {acoes.isLoading ? (
              <Skeleton className="m-4 h-48" />
            ) : linhas.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                Nenhuma ação registrada até o momento.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr className="[&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                      <th>Data</th>
                      <th>Tipo de Ação</th>
                      <th>Cidade</th>
                      <th>Local (Bairro/Condomínio)</th>
                      <th>Consultores</th>
                      <th>Leads</th>
                      <th>Fechado BL</th>
                      <th>Fechado Móvel</th>
                      <th>Obs</th>
                      {isLider && <th className="w-24" />}
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((a) => (
                      <tr key={a.id} className="border-t border-border [&>td]:px-3 [&>td]:py-2">
                        <td className="whitespace-nowrap">
                          {new Date(`${a.data}T00:00:00`).toLocaleDateString("pt-BR")}
                        </td>
                        <td>{a.tipo_acao ?? "—"}</td>
                        <td>{a.cidade ?? "—"}</td>
                        <td>{a.local ?? "—"}</td>
                        <td>{a.consultores ?? "—"}</td>
                        <td>{a.leads ?? "—"}</td>
                        <td>{a.fechado_bl ?? "—"}</td>
                        <td>{a.fechado_movel ?? "—"}</td>
                        <td className="max-w-[280px]">{a.obs ?? ""}</td>
                        {isLider && (
                          <td>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => abrirEdicao(a)}
                                aria-label="Editar ação"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => excluir.mutate(a.id)}
                                aria-label="Excluir ação"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar ação" : "Nova ação"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
              />
            </div>
            <CampoSelect
              label="Tipo de Ação"
              valor={form.tipo_acao}
              opcoes={listaDe("tipo_acao")}
              onChange={(v) => setForm({ ...form, tipo_acao: v })}
            />
            <CampoSelect
              label="Cidade"
              valor={form.cidade}
              opcoes={listaDe("cidade")}
              onChange={(v) => setForm({ ...form, cidade: v })}
            />
            <CampoSelect
              label="Local (Bairro/Condomínio)"
              valor={form.local}
              opcoes={listaDe("local")}
              onChange={(v) => setForm({ ...form, local: v })}
            />
            <CampoSelect
              label="Consultores"
              valor={form.consultores}
              opcoes={listaDe("consultor")}
              onChange={(v) => setForm({ ...form, consultores: v })}
            />
            <div className="space-y-1.5">
              <Label>Leads</Label>
              <Input
                type="number"
                min={0}
                value={form.leads}
                onChange={(e) => setForm({ ...form, leads: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fechado BL</Label>
              <Input
                type="number"
                min={0}
                value={form.fechado_bl}
                onChange={(e) => setForm({ ...form, fechado_bl: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fechado Móvel</Label>
              <Input
                type="number"
                min={0}
                value={form.fechado_movel}
                onChange={(e) => setForm({ ...form, fechado_movel: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Obs</Label>
              <Textarea
                rows={3}
                value={form.obs}
                onChange={(e) => setForm({ ...form, obs: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Kpi({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{valor}</div>
      </CardContent>
    </Card>
  );
}

function CampoSelect({
  label,
  valor,
  opcoes,
  onChange,
}: {
  label: string;
  valor: string;
  opcoes: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={valor || undefined} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={opcoes.length ? "Selecione" : "Cadastre as opções"} />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function OpcoesDialog({ uid, opcoes }: { uid?: string; opcoes: Opcao[] }) {
  const qc = useQueryClient();
  const [campo, setCampo] = useState<Campo>("tipo_acao");
  const [novo, setNovo] = useState("");
  const [editando, setEditando] = useState<{ id: string; valor: string } | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["planejamento-opcoes"] });

  const criar = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error("Sessão expirada.");
      const valor = novo.trim();
      if (!valor) throw new Error("Informe um valor.");
      const { error } = await supabase
        .from("planejamento_opcoes")
        .insert({ lider_id: uid, campo, valor });
      if (error) throw error;
    },
    onSuccess: () => {
      setNovo("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const atualizar = useMutation({
    mutationFn: async () => {
      if (!editando) return;
      const { error } = await supabase
        .from("planejamento_opcoes")
        .update({ valor: editando.valor.trim() })
        .eq("id", editando.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditando(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("planejamento_opcoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const lista = opcoes.filter((o) => o.campo === campo && o.lider_id === uid);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Settings2 className="mr-2 h-4 w-4" /> Opções
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Opções selecionáveis</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Campo</Label>
            <Select value={campo} onValueChange={(v) => setCampo(v as Campo)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAMPOS.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Nova opção"
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
            />
            <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
              Incluir
            </Button>
          </div>
          <div className="space-y-2">
            {lista.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma opção cadastrada.</p>
            )}
            {lista.map((o) => (
              <div key={o.id} className="flex items-center gap-2">
                {editando?.id === o.id ? (
                  <>
                    <Input
                      value={editando.valor}
                      onChange={(e) => setEditando({ id: o.id, valor: e.target.value })}
                    />
                    <Button size="sm" onClick={() => atualizar.mutate()}>
                      Salvar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 truncate text-sm">{o.valor}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Editar opção"
                      onClick={() => setEditando({ id: o.id, valor: o.valor })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Excluir opção"
                      onClick={() => remover.mutate(o.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
