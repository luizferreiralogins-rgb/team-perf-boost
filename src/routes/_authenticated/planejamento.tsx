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

  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));

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

  const atualizarCampo = useMutation({
    mutationFn: async (v: { id: string; campo: string; valor: string | number | null }) => {
      const { error } = await supabase
        .from("planejamento_acoes")
        .update({ [v.campo]: v.valor } as never)
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planejamento-acoes"] }),
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

  const linhas = useMemo(
    () => (acoes.data ?? []).filter((a) => (a.data ?? "").slice(0, 7) === mes),
    [acoes.data, mes],
  );
  const totais = useMemo(
    () => ({
      leads: linhas.reduce((s, l) => s + (l.leads ?? 0), 0),
      bl: linhas.reduce((s, l) => s + (l.fechado_bl ?? 0), 0),
      movel: linhas.reduce((s, l) => s + (l.fechado_movel ?? 0), 0),
    }),
    [linhas],
  );
  const porTipo = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of linhas) {
      const k = l.tipo_acao?.trim() || "Sem tipo";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [linhas]);

  const abrirNova = () => {
    setEditId(null);
    setForm({ ...vazio(), data: `${mes}-01` });
    setAberto(true);
  };

  const salvarCelula = (id: string, campo: string, valor: string, numerico = false) => {
    const v = numerico ? (valor === "" ? null : Number(valor)) : valor.trim() || null;
    atualizarCampo.mutate({ id, campo, valor: v });
  };

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h1 className="text-2xl font-bold">Planejamento</h1>
            <p className="text-sm text-muted-foreground">
              {isLider
                ? "Registre as ações do time PAP. Dê duplo clique em qualquer campo para editar."
                : "Planejamento de ações registrado pelo Líder PAP."}
            </p>
          </div>
          <div className="ml-auto flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Mês</Label>
              <Input
                type="month"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className="w-[150px]"
              />
            </div>
            {isLider && (
              <>
                <OpcoesDialog uid={uid} opcoes={opcoes.data ?? []} />
                <Button onClick={abrirNova}>
                  <Plus className="mr-2 h-4 w-4" /> Nova ação
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Kpi titulo="Leads" valor={totais.leads} />
          <Kpi titulo="Fechado BL" valor={totais.bl} />
          <Kpi titulo="Fechado Móvel" valor={totais.movel} />
          <Card className="sm:col-span-3 lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ações por tipo
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-x-4 gap-y-1 pt-0 text-sm">
              {porTipo.length === 0 ? (
                <span className="text-muted-foreground">Sem ações no mês.</span>
              ) : (
                porTipo.map(([tipo, qtd]) => (
                  <span key={tipo} className="whitespace-nowrap">
                    {tipo}: <strong>{qtd}</strong>
                  </span>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-0">
            {acoes.isLoading ? (
              <Skeleton className="m-4 h-48" />
            ) : linhas.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                Nenhuma ação registrada neste mês.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-fixed text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:font-medium">
                      <th className="w-[92px]">Data</th>
                      <th className="w-[150px]">Tipo de Ação</th>
                      <th className="w-[110px]">Cidade</th>
                      <th className="w-[170px]">Local</th>
                      <th className="w-[140px]">Consultores</th>
                      <th className="w-[70px]">Leads</th>
                      <th className="w-[80px]">Fech. BL</th>
                      <th className="w-[90px]">Fech. Móvel</th>
                      <th>Obs</th>
                      {isLider && <th className="w-[56px]" />}
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((a) => (
                      <tr key={a.id} className="border-t border-border [&>td]:px-2 [&>td]:py-1">
                        <td>
                          <Celula
                            editavel={isLider}
                            tipo="date"
                            valor={a.data ?? ""}
                            exibicao={
                              a.data
                                ? new Date(`${a.data}T00:00:00`).toLocaleDateString("pt-BR")
                                : "—"
                            }
                            onSalvar={(v) => v && salvarCelula(a.id, "data", v)}
                          />
                        </td>
                        <td>
                          <Celula
                            editavel={isLider}
                            tipo="select"
                            opcoes={listaDe("tipo_acao")}
                            valor={a.tipo_acao ?? ""}
                            onSalvar={(v) => salvarCelula(a.id, "tipo_acao", v)}
                          />
                        </td>
                        <td>
                          <Celula
                            editavel={isLider}
                            tipo="select"
                            opcoes={listaDe("cidade")}
                            valor={a.cidade ?? ""}
                            onSalvar={(v) => salvarCelula(a.id, "cidade", v)}
                          />
                        </td>
                        <td>
                          <Celula
                            editavel={isLider}
                            tipo="select"
                            opcoes={listaDe("local")}
                            valor={a.local ?? ""}
                            onSalvar={(v) => salvarCelula(a.id, "local", v)}
                          />
                        </td>
                        <td>
                          <Celula
                            editavel={isLider}
                            tipo="select"
                            opcoes={listaDe("consultor")}
                            valor={a.consultores ?? ""}
                            onSalvar={(v) => salvarCelula(a.id, "consultores", v)}
                          />
                        </td>
                        <td>
                          <Celula
                            editavel={isLider}
                            tipo="number"
                            valor={a.leads == null ? "" : String(a.leads)}
                            onSalvar={(v) => salvarCelula(a.id, "leads", v, true)}
                          />
                        </td>
                        <td>
                          <Celula
                            editavel={isLider}
                            tipo="number"
                            valor={a.fechado_bl == null ? "" : String(a.fechado_bl)}
                            onSalvar={(v) => salvarCelula(a.id, "fechado_bl", v, true)}
                          />
                        </td>
                        <td>
                          <Celula
                            editavel={isLider}
                            tipo="number"
                            valor={a.fechado_movel == null ? "" : String(a.fechado_movel)}
                            onSalvar={(v) => salvarCelula(a.id, "fechado_movel", v, true)}
                          />
                        </td>
                        <td>
                          <Celula
                            editavel={isLider}
                            tipo="text"
                            valor={a.obs ?? ""}
                            onSalvar={(v) => salvarCelula(a.id, "obs", v)}
                          />
                        </td>
                        {isLider && (
                          <td>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => excluir.mutate(a.id)}
                              aria-label="Excluir ação"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
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

function Celula({
  editavel,
  tipo,
  valor,
  exibicao,
  opcoes = [],
  onSalvar,
}: {
  editavel: boolean;
  tipo: "text" | "number" | "date" | "select";
  valor: string;
  exibicao?: string;
  opcoes?: string[];
  onSalvar: (v: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(valor);

  const abrir = () => {
    if (!editavel) return;
    setRascunho(valor);
    setEditando(true);
  };

  const texto = exibicao ?? (valor || "—");

  if (!editando) {
    return (
      <div
        onDoubleClick={abrir}
        title={editavel ? "Duplo clique para editar" : undefined}
        className={`min-h-7 truncate rounded px-1 py-1 ${
          editavel ? "cursor-pointer hover:bg-muted" : ""
        } ${valor ? "" : "text-muted-foreground"}`}
      >
        {texto}
      </div>
    );
  }

  if (tipo === "select") {
    return (
      <Select
        open
        value={valor || undefined}
        onValueChange={(v) => {
          setEditando(false);
          onSalvar(v);
        }}
        onOpenChange={(o) => !o && setEditando(false)}
      >
        <SelectTrigger className="h-8">
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      autoFocus
      type={tipo}
      className="h-8 px-1"
      value={rascunho}
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={() => {
        setEditando(false);
        if (rascunho !== valor) onSalvar(rascunho);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setEditando(false);
      }}
    />
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
