import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CalculadoraParcelaMedia,
  ProjecaoComissaoLoja,
  ProjecaoComissaoPap,
} from "@/components/vendas/projecao";
import {
  comissaoLoja,
  comissaoPap,
  faixaEfetivaLoja,
  type LojaFaixaTicket,
  type LojaMeta,
  type PapFaixa,
} from "@/lib/comissao";

export const Route = createFileRoute("/_authenticated/vendas/nova")({
  head: () => ({
    meta: [
      { title: "Nova venda — Unifique Comercial" },
      { name: "description", content: "Registre uma nova venda Unifique (Loja ou PAP)." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    lead_nome: typeof search.lead_nome === "string" ? search.lead_nome : undefined,
    lead_produto: typeof search.lead_produto === "string" ? search.lead_produto : undefined,
    lead_whatsapp: typeof search.lead_whatsapp === "string" ? search.lead_whatsapp : undefined,
    lead_cidade: typeof search.lead_cidade === "string" ? search.lead_cidade : undefined,
  }),
  beforeLoad: async () => {

    const { redirect } = await import("@tanstack/react-router");
    const { data: sess } = await supabase.auth.getUser();
    const uid = sess.user?.id;
    if (!uid) return;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    const list = (roles ?? []).map((r) => r.role);
    const isGestor = list.some((r) => r === "gerente" || r === "regional" || r === "admin");
    if (isGestor) throw redirect({ to: "/dashboard" });
  },
  component: NovaVenda,
});

export function useCanal() {
  return useQuery({
    queryKey: ["me-canal"],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user!.id;
      const { data } = await supabase.from("profiles").select("canal").eq("id", uid).maybeSingle();
      return (data?.canal ?? "loja") as "loja" | "pap";
    },
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function mesRefFromDate(d: string) {
  // "YYYY-MM-DD" -> "YYYY-MM-01" (coluna é DATE)
  return `${d.slice(0, 7)}-01`;
}


const statusEnum = z.enum(["pendente", "instalado", "cancelado", "em_analise"]);
type Status = z.infer<typeof statusEnum>;

const CLASSES_PROTOCOLO = [
  "Novo Acesso",
  "Renovação Contratual",
  "Adicional de Serviço",
  "Transferência de Endereço",
  "Migração de Tecnologia",
] as const;

const TECNOLOGIAS = [
  "01.04 - Internet - Banda Larga - Fibra",
  "02.02 - Telefonia - Voz - Fibra",
  "03.01 - TV - Fibra",
  "01.09 - IP Fixo",
  "06.04 - Aluguel de Equipamento",
  "10.01 - Câmeras de monitoramento",
  "14.01 - Telefonia móvel 5G",
  "11.01 - Wifi Business",
  "08.01 - Telefonia - Pabx Virtual",
  "12.01 - Telemedicina",
  "13.01 - Seguros",
  "15.01 - Casa Inteligente",
  "04.02 - Data Center - Hospedagem - Windows",
] as const;

const commonBase = {
  nome_cliente: z.string().trim().min(2, "Informe o nome do cliente").max(120),
  cpf_cnpj: z.string().trim().max(20).optional().or(z.literal("")),
  observacoes: z.string().max(500).optional().or(z.literal("")),
};

const lojaSchema = z.object({
  ...commonBase,
  protocolo: z.string().trim().max(60).optional().or(z.literal("")),
  data_abertura: z.string().min(1, "Informe a data de abertura"),
  data_ativacao: z.string().optional().or(z.literal("")),
  classe_protocolo: z.enum(CLASSES_PROTOCOLO),
  tecnologia: z.enum(TECNOLOGIAS),
  contem_movel: z.boolean(),
  qtd_linhas: z.coerce.number().int().min(0),
  valor_novo: z.coerce.number().positive("Valor novo deve ser maior que zero"),
  valor_antigo: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  instalado: z.boolean(),
});

const TIPOS_PROTOCOLO_PAP = [
  "Novo Acesso",
  "Adicional de Serviço",
  "Renovação Contratual",
  "Upgrade",
  "Venda Indireta",
] as const;

const PRODUTOS_PAP = [
  "Banda Larga",
  "Telefonia Fixa",
  "Câmeras",
  "Casa Inteligente",
  "Telefonia Unifique Móvel",
  "Pré-Pago Móvel",
  "Retenção Móvel",
  "Planos de TV",
  "Telemedicina PF",
  "Telemedicina PJ",
  "Unifique Seguro Residencial",
  "Wifi Business",
] as const;

const papSchema = z.object({
  nome_cliente: z.string().trim().min(2, "Informe o nome do cliente").max(120),
  protocolo: z.string().trim().max(60).optional().or(z.literal("")),
  tipo_protocolo: z.enum(TIPOS_PROTOCOLO_PAP),
  produto: z.enum(PRODUTOS_PAP),
  data: z.string().min(1, "Informe a data da venda"),
  data_instalacao: z.string().optional().or(z.literal("")),
  valor: z.coerce.number().positive("Valor deve ser maior que zero"),
  qtd_linhas: z.coerce.number().int().min(0),
  instalado: z.boolean(),
});

function NovaVenda() {
  const canalQ = useCanal();
  const search = Route.useSearch();

  const veioDeLead = !!(search.lead_nome || search.lead_produto || search.lead_whatsapp);
  const obsLead = [
    search.lead_whatsapp ? `WhatsApp: ${search.lead_whatsapp}` : "",
    search.lead_cidade ? `Cidade: ${search.lead_cidade}` : "",
    search.lead_produto ? `Interesse: ${search.lead_produto}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const initialLoja: FormLojaState | undefined = veioDeLead
    ? {
        protocolo: "",
        nome_cliente: search.lead_nome ?? "",
        cpf_cnpj: "",
        observacoes: obsLead ? `Origem: Lead. ${obsLead}` : "",
        data_abertura: today(),
        data_ativacao: "",
        classe_protocolo: "Novo Acesso",
        tecnologia: "01.04 - Internet - Banda Larga - Fibra",
        contem_movel: false,
        qtd_linhas: "0",
        valor_novo: "",
        valor_antigo: "",
        instalado: false,
      }
    : undefined;

  const produtoPap = PRODUTOS_PAP.find(
    (p) => p.toLowerCase() === (search.lead_produto ?? "").trim().toLowerCase(),
  );

  const initialPap: FormPapState | undefined = veioDeLead
    ? {
        protocolo: "",
        tipo_protocolo: "Novo Acesso",
        nome_cliente: search.lead_nome ?? "",
        produto: produtoPap ?? "Banda Larga",
        data: today(),
        data_instalacao: "",
        valor: "",
        qtd_linhas: "0",
        instalado: false,
      }
    : undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/vendas">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Nova venda</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {veioDeLead
            ? "Dados do lead carregados automaticamente. Complete as demais informações."
            : "Preencha os dados abaixo. A comissão só é contabilizada quando marcado como Instalado."}
        </p>
      </div>
      {canalQ.isLoading ? (
        <Card>
          <CardContent className="p-8 text-sm text-muted-foreground">Carregando...</CardContent>
        </Card>
      ) : canalQ.data === "pap" ? (
        <FormPap initial={initialPap} />
      ) : (
        <FormLoja initial={initialLoja} />
      )}
    </div>
  );
}


export type FormLojaState = {
  protocolo: string;
  nome_cliente: string;
  cpf_cnpj: string;
  observacoes: string;
  data_abertura: string;
  data_ativacao: string;
  classe_protocolo: (typeof CLASSES_PROTOCOLO)[number];
  tecnologia: (typeof TECNOLOGIAS)[number];
  contem_movel: boolean;
  qtd_linhas: string;
  valor_novo: string;
  valor_antigo: string;
  instalado: boolean;
};

export function FormLoja({
  editingId,
  initial,
  ownerId,
}: {
  editingId?: string;
  initial?: FormLojaState;
  ownerId?: string;
} = {}) {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormLojaState>(
    initial ?? {
      protocolo: "",
      nome_cliente: "",
      cpf_cnpj: "",
      observacoes: "",
      data_abertura: today(),
      data_ativacao: "",
      classe_protocolo: "Novo Acesso",
      tecnologia: "01.04 - Internet - Banda Larga - Fibra",
      contem_movel: false,
      qtd_linhas: "0",
      valor_novo: "",
      valor_antigo: "",
      instalado: false,
    },
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = lojaSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { data: sess } = await supabase.auth.getUser();
    const uid = ownerId ?? sess.user!.id;

    const dataRef = parsed.data.data_ativacao || parsed.data.data_abertura;
    const valorAntigoNum =
      typeof parsed.data.valor_antigo === "number" ? parsed.data.valor_antigo : null;

    // Comissão: calcula faixa efetiva do mês (1-3) considerando esta venda.
    let comissao = 0;
    let tipoFaixa: "faixa_0" | "faixa_1" | "faixa_2" | "faixa_3" = "faixa_0";
    const mesRef = mesRefFromDate(dataRef);
    if (parsed.data.instalado) {
      const [{ data: faixas }, { data: metas }, { data: mesVendas }] = await Promise.all([
        supabase
          .from("parametros_loja_faixas_ticket")
          .select("diff_de, diff_ate, faixa_0, faixa_1, faixa_2, faixa_3"),
        supabase
          .from("parametros_loja_metas")
          .select("faixa, meta_receita, meta_renov_movel"),
        supabase
          .from("vendas_loja")
          .select("id, valor_novo, classe_protocolo, contem_movel, status")
          .eq("vendedor_id", uid)
          .eq("mes_ref", mesRef),
      ]);

      // Ao editar, exclui a própria venda do acumulado (será recontabilizada).
      const rows = (mesVendas ?? []).filter((v) => v.id !== editingId);
      const receitaMes =
        rows
          .filter((v) => v.status === "instalado")
          .reduce((s, v) => s + Number(v.valor_novo ?? 0), 0) + parsed.data.valor_novo;
      const totalRenov =
        rows.filter((v) => v.classe_protocolo === "Renovação Contratual").length +
        (parsed.data.classe_protocolo === "Renovação Contratual" ? 1 : 0);
      const renovComMovel =
        rows.filter((v) => v.classe_protocolo === "Renovação Contratual" && v.contem_movel).length +
        (parsed.data.classe_protocolo === "Renovação Contratual" && parsed.data.contem_movel ? 1 : 0);
      const ratio = totalRenov > 0 ? renovComMovel / totalRenov : 0;

      const faixaEfet = faixaEfetivaLoja((metas ?? []) as LojaMeta[], receitaMes, ratio);
      const { porFaixa } = comissaoLoja(
        (faixas ?? []) as LojaFaixaTicket[],
        parsed.data.valor_novo,
        valorAntigoNum,
        true,
      );
      comissao = porFaixa[faixaEfet] ?? 0;
      tipoFaixa = (`faixa_${faixaEfet}` as typeof tipoFaixa);
    }

    const payload = {
      vendedor_id: uid,
      protocolo: parsed.data.protocolo || null,
      nome_cliente: parsed.data.nome_cliente,
      cpf_cnpj: parsed.data.cpf_cnpj || null,
      data_abertura: parsed.data.data_abertura,
      data_ativacao: parsed.data.data_ativacao || null,
      classe_protocolo: parsed.data.classe_protocolo,
      mes_ref: mesRef,
      valor_novo: parsed.data.valor_novo,
      valor_antigo: valorAntigoNum,
      tecnologia: parsed.data.tecnologia,
      contem_movel: parsed.data.contem_movel,
      qtd_linhas: parsed.data.qtd_linhas,
      status: parsed.data.instalado ? ("instalado" as const) : ("pendente" as const),
      comissao,
      tipo_comissao: tipoFaixa,
      observacoes: parsed.data.observacoes || null,
    };

    const { error } = editingId
      ? await supabase.from("vendas_loja").update(payload).eq("id", editingId)
      : await supabase.from("vendas_loja").insert(payload);
    setLoading(false);
    if (error) {
      toast.error("Erro ao salvar venda: " + error.message);
      return;
    }
    toast.success(editingId ? "Venda atualizada!" : "Venda registrada!");
    navigate({ to: editingId ? "/historico" : "/vendas" });

  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader>
          <CardTitle>Venda de Loja</CardTitle>
          <CardDescription>Registro para o canal Loja.</CardDescription>
        </CardHeader>
        <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Protocolo">
              <Input
                value={form.protocolo}
                onChange={(e) => setForm({ ...form, protocolo: e.target.value })}
                placeholder="Nº do protocolo"
              />
            </Field>
            <Field label="Cliente" required>
              <Input
                value={form.nome_cliente}
                onChange={(e) => setForm({ ...form, nome_cliente: e.target.value })}
                required
              />
            </Field>
            <Field label="CPF/CNPJ">
              <Input
                value={form.cpf_cnpj}
                onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })}
              />
            </Field>
            <Field label="Classe de protocolo" required>
              <Select
                value={form.classe_protocolo}
                onValueChange={(v) =>
                  setForm({ ...form, classe_protocolo: v as (typeof CLASSES_PROTOCOLO)[number] })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLASSES_PROTOCOLO.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Data de abertura do protocolo" required>
              <Input
                type="date"
                value={form.data_abertura}
                onChange={(e) => setForm({ ...form, data_abertura: e.target.value })}
                required
              />
            </Field>
            <Field label="Data de ativação" hint="Preencha quando o serviço for ativado.">
              <Input
                type="date"
                value={form.data_ativacao}
                onChange={(e) => setForm({ ...form, data_ativacao: e.target.value })}
              />
            </Field>
            <Field label="Tecnologia" required>
              <Select
                value={form.tecnologia}
                onValueChange={(v) =>
                  setForm({ ...form, tecnologia: v as (typeof TECNOLOGIAS)[number] })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TECNOLOGIAS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Contém móvel?">
              <Select
                value={form.contem_movel ? "sim" : "nao"}
                onValueChange={(v) => setForm({ ...form, contem_movel: v === "sim" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao">Não</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Qtd. de linhas">
              <Input
                type="number"
                min="0"
                step="1"
                value={form.qtd_linhas}
                onChange={(e) => setForm({ ...form, qtd_linhas: e.target.value })}
              />
            </Field>
            <Field label="Valor novo (R$)" required>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.valor_novo}
                onChange={(e) => setForm({ ...form, valor_novo: e.target.value })}
                required
              />
            </Field>
            <Field label="Valor antigo (R$)" hint="Em branco = cliente novo.">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.valor_antigo}
                onChange={(e) => setForm({ ...form, valor_antigo: e.target.value })}
              />
            </Field>
            <Field label="Instalado?" hint="Comissão só é contabilizada quando Sim." required>
              <Select
                value={form.instalado ? "sim" : "nao"}
                onValueChange={(v) => setForm({ ...form, instalado: v === "sim" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao">Não</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Observações">
            <Textarea
              rows={3}
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" asChild>
              <Link to="/vendas">Cancelar</Link>
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Salvar venda"}
            </Button>
          </div>
        </form>
        </CardContent>
      </Card>
      <aside className="space-y-4">
        <ProjecaoComissaoLoja
          valorNovo={form.valor_novo}
          valorAntigo={form.valor_antigo}
          instalado={form.instalado}
        />
        <CalculadoraParcelaMedia defaultParcelaNormal={form.valor_novo} />
      </aside>
    </div>
  );
}

export type FormPapState = {
  protocolo: string;
  tipo_protocolo: (typeof TIPOS_PROTOCOLO_PAP)[number];
  nome_cliente: string;
  produto: (typeof PRODUTOS_PAP)[number];
  data: string;
  data_instalacao: string;
  valor: string;
  instalado: boolean;
};

export function FormPap({
  editingId,
  initial,
  ownerId,
}: {
  editingId?: string;
  initial?: FormPapState;
  ownerId?: string;
} = {}) {

  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormPapState>(
    initial ?? {
      protocolo: "",
      tipo_protocolo: "Novo Acesso",
      nome_cliente: "",
      produto: "Banda Larga",
      data: today(),
      data_instalacao: "",
      valor: "",
      instalado: false,
    },
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = papSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { data: sess } = await supabase.auth.getUser();
    const uid = ownerId ?? sess.user!.id;


    let comissao = 0;
    if (parsed.data.instalado) {
      const { data: faixas } = await supabase
        .from("parametros_pap_faixas")
        .select("faixa, receita_de, receita_ate, pct_comissao, acelerador_baixo_cancel");
      const r = comissaoPap((faixas ?? []) as PapFaixa[], parsed.data.valor, true);
      comissao = r.valor;
    }

    const payload = {
      vendedor_id: uid,
      protocolo: parsed.data.protocolo || null,
      tipo_protocolo: parsed.data.tipo_protocolo,
      nome_cliente: parsed.data.nome_cliente,
      data_venda: parsed.data.data,
      data_ativacao: parsed.data.data_instalacao || null,
      mes_ref: mesRefFromDate(parsed.data.data_instalacao || parsed.data.data),
      valor: parsed.data.valor,
      produto: parsed.data.produto,
      status: parsed.data.instalado ? ("instalado" as const) : ("pendente" as const),
      comissao,
    };
    const { error } = editingId
      ? await supabase.from("vendas_pap").update(payload).eq("id", editingId)
      : await supabase.from("vendas_pap").insert(payload);
    setLoading(false);
    if (error) {
      toast.error("Erro ao salvar venda: " + error.message);
      return;
    }
    toast.success(editingId ? "Venda atualizada!" : "Venda registrada!");
    navigate({ to: editingId ? "/historico" : "/vendas" });

  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader>
          <CardTitle>Venda PAP</CardTitle>
          <CardDescription>Registro para o canal Porta a Porta.</CardDescription>
        </CardHeader>
        <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Protocolo">
              <Input
                value={form.protocolo}
                onChange={(e) => setForm({ ...form, protocolo: e.target.value })}
                placeholder="Nº do protocolo"
              />
            </Field>
            <Field label="Tipo de protocolo" required>
              <Select
                value={form.tipo_protocolo}
                onValueChange={(v) =>
                  setForm({ ...form, tipo_protocolo: v as (typeof TIPOS_PROTOCOLO_PAP)[number] })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_PROTOCOLO_PAP.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Cliente" required>
              <Input
                value={form.nome_cliente}
                onChange={(e) => setForm({ ...form, nome_cliente: e.target.value })}
                required
              />
            </Field>
            <Field label="Produto" required>
              <Select
                value={form.produto}
                onValueChange={(v) => setForm({ ...form, produto: v as (typeof PRODUTOS_PAP)[number] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRODUTOS_PAP.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Data da venda" required>
              <Input
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
                required
              />
            </Field>
            <Field label="Data de instalação" hint="Preencha quando o serviço for instalado.">
              <Input
                type="date"
                value={form.data_instalacao}
                onChange={(e) => setForm({ ...form, data_instalacao: e.target.value })}
              />
            </Field>
            <Field label="Valor da venda (R$)" required>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                required
              />
            </Field>
            <Field label="Instalado?" hint="Comissão só é contabilizada quando Sim." required>
              <Select
                value={form.instalado ? "sim" : "nao"}
                onValueChange={(v) => setForm({ ...form, instalado: v === "sim" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao">Não</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" asChild>
              <Link to="/vendas">Cancelar</Link>
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Salvar venda"}
            </Button>
          </div>
        </form>
        </CardContent>
      </Card>
      <aside className="space-y-4">
        <ProjecaoComissaoPap valor={form.valor} instalado={form.instalado} />
        <CalculadoraParcelaMedia defaultParcelaNormal={form.valor} />
      </aside>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
