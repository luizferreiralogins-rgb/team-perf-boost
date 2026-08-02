import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useOrdenacao, cmpTexto, cmpDataDesc, type OpcaoOrdenacao } from "@/components/ordenacao";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  ArrowRightLeft,
  Check,
  X,
  Users,
  Pencil,
  Trash2,
  MapPin,
  ShoppingCart,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { WhatsAppLink } from "@/components/whatsapp-link";
import { CadenciaLead } from "@/components/leads/cadencia-contato";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({
    meta: [
      { title: "Leads — Unifique Comercial" },
      { name: "description", content: "CRM de leads em modelo Kanban com transferências entre consultores." },
    ],
  }),
  component: LeadsPage,
});

type LeadStatus =
  | "contato_feito"
  | "negociando"
  | "desistiu"
  | "fechou"
  | "nao_perturbar"
  | "transferido";

type Lead = {
  id: string;
  vendedor_id: string;
  nome: string;
  cidade: string | null;
  fonte: string | null;
  email: string | null;
  whatsapp: string | null;
  produto_interesse: string | null;
  status: LeadStatus;
  observacoes: string | null;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  localizacao: string | null;
  etapa_contato: number;
  proximo_contato_em: string | null;
};


const COLUMNS: { key: LeadStatus; label: string; tone: string }[] = [
  { key: "contato_feito", label: "Contato Feito", tone: "bg-sky-100 text-sky-800 border-sky-200" },
  { key: "negociando", label: "Negociando", tone: "bg-amber-100 text-amber-800 border-amber-200" },
  { key: "fechou", label: "Fechou", tone: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { key: "desistiu", label: "Desistiu", tone: "bg-rose-100 text-rose-800 border-rose-200" },
  { key: "nao_perturbar", label: "Não Perturbar", tone: "bg-zinc-200 text-zinc-800 border-zinc-300" },
  { key: "transferido", label: "Transferido", tone: "bg-violet-100 text-violet-800 border-violet-200" },
];

function useMe() {
  return useQuery({
    queryKey: ["me-basic-canal"],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id ?? null;
      if (!uid) return null;
      const [{ data: roles }, { data: prof }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("profiles").select("canal").eq("id", uid).maybeSingle(),
      ]);
      return {
        userId: uid,
        roles: (roles ?? []).map((r) => r.role as string),
        canal: (prof?.canal ?? "loja") as "loja" | "pap",
      };
    },
    staleTime: 30_000,
  });
}


function LeadsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [transferFor, setTransferFor] = useState<Lead | null>(null);
  const [detail, setDetail] = useState<Lead | null>(null);

  const isConsultor =
    !!me.data && me.data.roles.includes("consultor") &&
    !me.data.roles.some((r) => ["gerente", "lider_pap", "regional", "admin"].includes(r));

  const leadsQ = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      await supabase.rpc("expirar_leads_sem_contato");
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const vendedorIds = Array.from(new Set((leadsQ.data ?? []).map((l) => l.vendedor_id)));
  const vendedoresQ = useQuery({
    queryKey: ["profiles-lead-vendedores", vendedorIds.join(",")],
    queryFn: async () => {
      if (!vendedorIds.length) return [] as { id: string; nome: string }[];
      const { data } = await supabase.from("profiles").select("id, nome").in("id", vendedorIds);
      return (data ?? []) as { id: string; nome: string }[];
    },
    enabled: vendedorIds.length > 0,
  });
  const nomesVendedores = useMemo(() => {
    const m: Record<string, string> = {};
    (vendedoresQ.data ?? []).forEach((p) => (m[p.id] = p.nome));
    return m;
  }, [vendedoresQ.data]);



  const transfersQ = useQuery({
    queryKey: ["lead-transfers-inbox"],
    queryFn: async () => {
      const uid = me.data?.userId;
      if (!uid) return [];
      const { data, error } = await supabase
        .from("lead_transferencias")
        .select("id, lead_id, from_user, to_user, status, mensagem, created_at")
        .eq("to_user", uid)
        .eq("status", "pendente")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!me.data?.userId,
  });

  const inboxLeadIds = (transfersQ.data ?? []).map((t: any) => t.lead_id);
  const inboxLeadsQ = useQuery({
    queryKey: ["leads-inbox", inboxLeadIds.join(",")],
    queryFn: async () => {
      if (!inboxLeadIds.length) return [] as Lead[];
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .in("id", inboxLeadIds);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
    enabled: inboxLeadIds.length > 0,
  });

  const senderIds = Array.from(new Set((transfersQ.data ?? []).map((t: any) => t.from_user)));
  const sendersQ = useQuery({
    queryKey: ["profiles-senders", senderIds.join(",")],
    queryFn: async () => {
      if (!senderIds.length) return [] as { id: string; nome: string }[];
      const { data } = await supabase.from("profiles").select("id, nome").in("id", senderIds);
      return (data ?? []) as { id: string; nome: string }[];
    },
    enabled: senderIds.length > 0,
  });

  const acceptMut = useMutation({
    mutationFn: async (transferId: string) => {
      const { error } = await supabase.rpc("aceitar_transferencia_lead", {
        _transfer_id: transferId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transferência aceita — lead adicionado ao seu funil.");
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead-transfers-inbox"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao aceitar"),
  });

  const rejectMut = useMutation({
    mutationFn: async (transferId: string) => {
      const { error } = await supabase
        .from("lead_transferencias")
        .update({ status: "recusada" })
        .eq("id", transferId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transferência recusada.");
      qc.invalidateQueries({ queryKey: ["lead-transfers-inbox"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao recusar"),
  });

  const moveMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeadStatus }) => {
      const { error } = await supabase.from("leads").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
    onError: (e: any) => toast.error(e.message ?? "Falha ao atualizar"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead removido.");
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao remover"),
  });

  const opcoesOrdem = useMemo<OpcaoOrdenacao<Lead>[]>(
    () => [
      { valor: "recentes", label: "Cadastro (recente)", cmp: cmpDataDesc((l) => l.created_at) },
      { valor: "nome", label: "Nome (A-Z)", cmp: cmpTexto((l) => l.nome) },
      { valor: "produto", label: "Produto (A-Z)", cmp: cmpTexto((l) => l.produto_interesse ?? "") },
      { valor: "consultor", label: "Consultor (A-Z)", cmp: cmpTexto((l) => nomesVendedores[l.vendedor_id] ?? "") },
    ],
    [nomesVendedores],
  );
  const { rows: leadsOrdenados, control: ordenarControl } = useOrdenacao(
    leadsQ.data ?? [],
    opcoesOrdem,
  );

  const grouped = useMemo(() => {
    const g: Record<LeadStatus, Lead[]> = {
      contato_feito: [],
      negociando: [],
      fechou: [],
      desistiu: [],
      nao_perturbar: [],
      transferido: [],
    };
    leadsOrdenados.forEach((l) => g[l.status].push(l));
    return g;
  }, [leadsOrdenados]);

  const inbox = (transfersQ.data ?? []).map((t: any) => ({
    ...t,
    lead: (inboxLeadsQ.data ?? []).find((l) => l.id === t.lead_id),
    sender: (sendersQ.data ?? []).find((s) => s.id === t.from_user),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads (CRM)</h1>
          <p className="text-sm text-muted-foreground">
            Gestão de leads em modelo Kanban — arraste pelo status ou edite pela ação de cada card.
          </p>
        </div>
        {isConsultor && (
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Novo lead
          </Button>
        )}
      </div>

      {inbox.length > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowRightLeft className="h-4 w-4" /> Transferências pendentes para você
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {inbox.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3"
              >
                <div className="min-w-0">
                  <div className="font-medium">
                    {t.lead?.nome ?? "Lead"}{" "}
                    <span className="text-xs text-muted-foreground">
                      · enviado por {t.sender?.nome ?? "consultor"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t.lead?.cidade ?? ""} {t.lead?.produto_interesse ? `· ${t.lead.produto_interesse}` : ""}
                    {t.mensagem ? ` · "${t.mensagem}"` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => acceptMut.mutate(t.id)}
                    disabled={acceptMut.isPending}
                  >
                    <Check className="mr-1 h-4 w-4" /> Aceitar transferir?
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => rejectMut.mutate(t.id)}
                    disabled={rejectMut.isPending}
                  >
                    <X className="mr-1 h-4 w-4" /> Recusar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">{ordenarControl}</div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {COLUMNS.map((col) => (
          <div key={col.key} className="rounded-xl border bg-card">
            <div className={`flex items-center justify-between rounded-t-xl border-b px-3 py-2 ${col.tone}`}>
              <div className="font-semibold text-sm">{col.label}</div>
              <Badge variant="secondary">{grouped[col.key].length}</Badge>
            </div>
            <div
              className="min-h-[120px] space-y-2 p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/plain");
                if (id) moveMut.mutate({ id, status: col.key });
              }}
            >
              {grouped[col.key].map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  draggable={isConsultor && lead.vendedor_id === me.data?.userId}
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", lead.id)}
                  onClick={() => setDetail(lead)}
                  className="w-full cursor-pointer rounded-lg border bg-background p-3 text-left shadow-sm transition hover:shadow-md active:cursor-grabbing"
                >
                  <div className="font-medium">{lead.nome}</div>
                  <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    <div>{nomesVendedores[lead.vendedor_id] ?? "Consultor"}</div>
                    {lead.produto_interesse && <div>{lead.produto_interesse}</div>}
                    {lead.proximo_contato_em && (
                      <div
                        className={
                          lead.proximo_contato_em < new Date().toISOString().slice(0, 10)
                            ? "font-medium text-destructive"
                            : ""
                        }
                      >
                        Próximo contato:{" "}
                        {new Date(lead.proximo_contato_em + "T00:00:00").toLocaleDateString("pt-BR")}
                      </div>
                    )}
                  </div>

                </button>
              ))}

              {grouped[col.key].length === 0 && (
                <div className="py-8 text-center text-xs text-muted-foreground">Vazio</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {!isConsultor && me.data && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" /> Você está visualizando os leads do time — apenas consultores podem
          criar, editar ou transferir leads.
        </p>
      )}

      <LeadFormDialog
        open={newOpen}
        isPap={me.data?.canal === "pap"}
        onClose={() => setNewOpen(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["leads"] })}
      />
      <LeadFormDialog
        open={!!editing}
        lead={editing ?? undefined}
        isPap={me.data?.canal === "pap"}
        onClose={() => setEditing(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["leads"] })}
      />

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {(() => {
            const lead = (leadsQ.data ?? []).find((l) => l.id === detail?.id) ?? detail;
            if (!lead) return null;
            const meu = lead.vendedor_id === me.data?.userId;
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{lead.nome}</DialogTitle>
                  <DialogDescription>
                    {nomesVendedores[lead.vendedor_id] ?? "Consultor"}
                    {lead.produto_interesse ? ` · ${lead.produto_interesse}` : ""}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-1 text-sm text-muted-foreground">
                  {lead.cidade && <div>Cidade: {lead.cidade}</div>}
                  {lead.whatsapp && (
                    <div>
                      WhatsApp: <WhatsAppLink numero={lead.whatsapp} />
                    </div>
                  )}
                  {lead.fonte && <div>Fonte: {lead.fonte}</div>}
                  {lead.observacoes && <div className="whitespace-pre-wrap">Obs.: {lead.observacoes}</div>}
                  {(lead.latitude != null || lead.localizacao) && (
                    <a
                      className="flex items-center gap-1 text-primary hover:underline"
                      href={
                        lead.latitude != null
                          ? `https://www.google.com/maps?q=${lead.latitude},${lead.longitude}`
                          : `https://www.google.com/maps?q=${encodeURIComponent(lead.localizacao ?? "")}`
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MapPin className="h-3.5 w-3.5" /> Localização
                    </a>
                  )}
                </div>

                {meu && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setDetail(null); setEditing(lead); }}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setDetail(null); setTransferFor(lead); }}>
                      <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" /> Transferir
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm("Remover este lead?")) {
                          deleteMut.mutate(lead.id);
                          setDetail(null);
                        }
                      }}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Excluir
                    </Button>
                  </div>
                )}

                {isConsultor && meu && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    onClick={() =>
                      navigate({
                        to: "/vendas/nova",
                        search: {
                          lead_nome: lead.nome,
                          lead_produto: lead.produto_interesse ?? undefined,
                          lead_whatsapp: lead.whatsapp ?? undefined,
                          lead_cidade: lead.cidade ?? undefined,
                        },
                      })
                    }
                  >
                    <ShoppingCart className="mr-1.5 h-3.5 w-3.5" /> Transformar em venda
                  </Button>
                )}

                {!["desistiu", "fechou", "nao_perturbar", "transferido"].includes(lead.status) && (
                  <CadenciaLead
                    leadId={lead.id}
                    etapa={lead.etapa_contato ?? 0}
                    proximoContatoEm={lead.proximo_contato_em}
                    podeRegistrar={meu}
                    onRegistrado={() => qc.invalidateQueries({ queryKey: ["leads"] })}
                  />
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>


      <TransferDialog
        lead={transferFor}
        onClose={() => setTransferFor(null)}
        onDone={() => qc.invalidateQueries({ queryKey: ["leads"] })}
      />
    </div>
  );
}

function LeadFormDialog({
  open,
  lead,
  isPap,
  onClose,
  onSaved,
}: {
  open: boolean;
  lead?: Lead;
  isPap?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    nome: "",
    cidade: "",
    fonte: "",
    whatsapp: "",
    produto_interesse: "",
    status: "contato_feito" as LeadStatus,
    observacoes: "",
    latitude: null as number | null,
    longitude: null as number | null,
    localizacao: "" as string,
  });
  const [duplicates, setDuplicates] = useState<
    { lead_id: string; vendedor_id: string; vendedor_nome: string; nome: string }[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);

  // reset when opening
  useMemo(() => {
    if (open) {
      setForm({
        nome: lead?.nome ?? "",
        cidade: lead?.cidade ?? "",
        fonte: lead?.fonte ?? "",
        whatsapp: lead?.whatsapp ?? "",
        produto_interesse: lead?.produto_interesse ?? "",
        status: lead?.status ?? "contato_feito",
        observacoes: lead?.observacoes ?? "",
        latitude: lead?.latitude ?? null,
        longitude: lead?.longitude ?? null,
        localizacao: lead?.localizacao ?? "",
      });
      setDuplicates([]);
    }
  }, [open, lead]);

  const capturarLocalizacao = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocalização não suportada neste dispositivo.");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setForm((f) => ({
          ...f,
          latitude: lat,
          longitude: lng,
          localizacao: `${lat}, ${lng}`,
        }));
        setGeoLoading(false);
        toast.success("Localização capturada.");
      },
      (err) => {
        setGeoLoading(false);
        toast.error(err.message || "Não foi possível obter a localização.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const checkDup = async () => {
    if (lead) return; // só na criação
    if (!form.whatsapp) {
      setDuplicates([]);
      return;
    }
    const { data } = await supabase.rpc("buscar_lead_duplicado", {
      _email: "",
      _whatsapp: form.whatsapp || "",
    });

    setDuplicates((data ?? []) as any);
  };



  const submit = async () => {
    if (!form.nome.trim()) {
      toast.error("Informe o nome do lead.");
      return;
    }
    setSaving(true);
    try {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user!.id;
      const payload = {
        nome: form.nome.trim(),
        cidade: form.cidade.trim() || null,
        fonte: form.fonte.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        produto_interesse: form.produto_interesse.trim() || null,
        status: form.status,
        observacoes: form.observacoes.trim() || null,
        latitude: form.latitude,
        longitude: form.longitude,
        localizacao: form.localizacao.trim() || null,
      };

      if (lead) {
        const { error } = await supabase.from("leads").update(payload).eq("id", lead.id);
        if (error) throw error;
        toast.success("Lead atualizado.");
      } else {
        const { error } = await supabase.from("leads").insert({ ...payload, vendedor_id: uid });
        if (error) throw error;
        toast.success("Lead cadastrado.");
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const suggestTransfer = async (dup: { lead_id: string; vendedor_id: string; vendedor_nome: string }) => {
    // Envia solicitação de transferência do lead do consultor DONO -> para mim
    // Como não somos o dono, criamos uma transferência com from_user=eu e to_user=dono
    // pedindo que o dono aceite mover o lead para nós? A regra é: sugere para o outro consultor.
    // Interpretação escolhida: enviamos ao dono uma solicitação para ele TRANSFERIR o lead a nós.
    // Registro: from_user = eu (solicitante), to_user = dono. Dono aceita → aceitar_transferencia_lead
    // moverá o lead para o to_user (dono), o que é ele mesmo. Isso não faz sentido.
    //
    // Ajuste: registramos from_user=dono, to_user=eu? Mas RLS exige from_user=auth.uid().
    // Solução: pulamos essa etapa e apenas mostramos o dono; o próprio dono, ao ver o duplicado,
    // pode iniciar transferência para mim. Portanto, aqui apenas informamos.
    toast.message(
      `Lead já pertence a ${dup.vendedor_nome}. Peça a ele para transferir a você pela tela de Leads.`,
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{lead ? "Editar lead" : "Novo lead"}</DialogTitle>
          <DialogDescription>
            Cadastro simples para gestão no CRM. Ao informar o WhatsApp, verificamos se outro
            consultor já cadastrou.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Cidade</Label>
              <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Fonte</Label>
              <Input
                placeholder="Indicação, Instagram, Porta a porta..."
                value={form.fonte}
                onChange={(e) => setForm({ ...form, fonte: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>WhatsApp</Label>
            <Input
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              onBlur={checkDup}
            />
          </div>
          {isPap && (
            <div className="grid gap-1.5">
              <Label>Localização (opcional)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Nenhuma localização registrada"
                  value={form.localizacao}
                  onChange={(e) => setForm({ ...form, localizacao: e.target.value })}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={capturarLocalizacao}
                  disabled={geoLoading}
                >
                  <MapPin className="mr-1.5 h-4 w-4" />
                  {geoLoading ? "Obtendo..." : "Coletar"}
                </Button>
              </div>
              {form.latitude != null && (
                <p className="text-xs text-muted-foreground">
                  Coordenadas: {form.latitude}, {form.longitude}
                </p>
              )}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>Produto de interesse</Label>
            <Input
              value={form.produto_interesse}
              onChange={(e) => setForm({ ...form, produto_interesse: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as LeadStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLUMNS.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Observações</Label>
            <Textarea
              rows={2}
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            />
          </div>

          {duplicates.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
              <div className="font-medium text-amber-900">
                Este contato já está cadastrado por outro consultor:
              </div>
              <ul className="mt-2 space-y-2">
                {duplicates.map((d) => (
                  <li key={d.lead_id} className="flex items-center justify-between gap-2">
                    <span className="text-amber-900">
                      {d.nome} · <strong>{d.vendedor_nome}</strong>
                    </span>
                    <Button size="sm" variant="outline" onClick={() => suggestTransfer(d)}>
                      Solicitar transferência
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-amber-800">
                Você ainda pode salvar seu lead — o dono atual será notificado e poderá transferir a você
                pela ação de transferência no card dele.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Salvando..." : lead ? "Salvar" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({
  lead,
  onClose,
  onDone,
}: {
  lead: Lead | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [toUser, setToUser] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const consultoresQ = useQuery({
    queryKey: ["consultores-para-transferir"],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "consultor");
      const ids = (roles ?? []).map((r) => r.user_id).filter((id) => id !== uid);
      if (!ids.length) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, nome, canal")
        .in("id", ids)
        .order("nome");
      return data ?? [];
    },
    enabled: !!lead,
  });

  const submit = async () => {
    if (!lead || !toUser) return;
    setSaving(true);
    try {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user!.id;
      const { error } = await supabase.from("lead_transferencias").insert({
        lead_id: lead.id,
        from_user: uid,
        to_user: toUser,
        mensagem: msg.trim() || null,
      });
      if (error) throw error;
      toast.success("Solicitação de transferência enviada.");
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao enviar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir lead</DialogTitle>
          <DialogDescription>
            O consultor selecionado receberá uma solicitação com o botão "Aceitar transferir?".
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Consultor destinatário</Label>
            <Select value={toUser} onValueChange={setToUser}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um consultor" />
              </SelectTrigger>
              <SelectContent>
                {(consultoresQ.data ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome} ({c.canal.toUpperCase()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Mensagem (opcional)</Label>
            <Textarea rows={2} value={msg} onChange={(e) => setMsg(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || !toUser}>
            {saving ? "Enviando..." : "Enviar solicitação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
