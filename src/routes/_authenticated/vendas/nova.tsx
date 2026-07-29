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

export const Route = createFileRoute("/_authenticated/vendas/nova")({
  head: () => ({
    meta: [
      { title: "Nova venda — Unifique Comercial" },
      { name: "description", content: "Registre uma nova venda Unifique (Loja ou PAP)." },
    ],
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

function useCanal() {
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

const papSchema = z.object({
  ...commonBase,
  data: z.string().min(1, "Informe a data"),
  status: statusEnum,
  valor: z.coerce.number().positive("Valor deve ser maior que zero"),
  cidade: z.string().trim().max(80).optional().or(z.literal("")),
  bairro: z.string().trim().max(80).optional().or(z.literal("")),
  produto: z.string().trim().max(60).optional().or(z.literal("")),
});

function NovaVenda() {
  const canalQ = useCanal();
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
          Preencha os dados abaixo. A comissão só é contabilizada quando marcado como Instalado.
        </p>
      </div>
      {canalQ.isLoading ? (
        <Card>
          <CardContent className="p-8 text-sm text-muted-foreground">Carregando...</CardContent>
        </Card>
      ) : canalQ.data === "pap" ? (
        <FormPap />
      ) : (
        <FormLoja />
      )}
    </div>
  );
}

function FormLoja() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    protocolo: "",
    nome_cliente: "",
    cpf_cnpj: "",
    observacoes: "",
    data_abertura: today(),
    data_ativacao: "",
    classe_protocolo: "Novo Acesso" as (typeof CLASSES_PROTOCOLO)[number],
    tecnologia: "01.04 - Internet - Banda Larga - Fibra" as (typeof TECNOLOGIAS)[number],
    contem_movel: false,
    qtd_linhas: "0",
    valor_novo: "",
    valor_antigo: "",
    instalado: false,
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = lojaSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { data: sess } = await supabase.auth.getUser();
    const uid = sess.user!.id;
    const dataRef = parsed.data.data_ativacao || parsed.data.data_abertura;
    const { error } = await supabase.from("vendas_loja").insert({
      vendedor_id: uid,
      protocolo: parsed.data.protocolo || null,
      nome_cliente: parsed.data.nome_cliente,
      cpf_cnpj: parsed.data.cpf_cnpj || null,
      data_abertura: parsed.data.data_abertura,
      data_ativacao: parsed.data.data_ativacao || null,
      classe_protocolo: parsed.data.classe_protocolo,
      mes_ref: mesRefFromDate(dataRef),
      valor_novo: parsed.data.valor_novo,
      valor_antigo:
        typeof parsed.data.valor_antigo === "number" ? parsed.data.valor_antigo : null,
      tecnologia: parsed.data.tecnologia,
      contem_movel: parsed.data.contem_movel,
      qtd_linhas: parsed.data.qtd_linhas,
      status: parsed.data.instalado ? "instalado" : "pendente",
      observacoes: parsed.data.observacoes || null,
    });
    setLoading(false);
    if (error) {
      toast.error("Erro ao salvar venda: " + error.message);
      return;
    }
    toast.success("Venda registrada!");
    navigate({ to: "/vendas" });
  }

  return (
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
  );
}

function FormPap() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nome_cliente: "",
    cpf_cnpj: "",
    cidade: "",
    bairro: "",
    data: today(),
    valor: "",
    produto: "",
    status: "pendente" as Status,
    observacoes: "",
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = papSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { data: sess } = await supabase.auth.getUser();
    const uid = sess.user!.id;
    const { error } = await supabase.from("vendas_pap").insert({
      vendedor_id: uid,
      nome_cliente: parsed.data.nome_cliente,
      cpf_cnpj: parsed.data.cpf_cnpj || null,
      cidade: parsed.data.cidade || null,
      bairro: parsed.data.bairro || null,
      data_venda: parsed.data.data,
      mes_ref: mesRefFromDate(parsed.data.data),
      valor: parsed.data.valor,
      produto: parsed.data.produto || null,
      status: parsed.data.status,
      observacoes: parsed.data.observacoes || null,
    });
    setLoading(false);
    if (error) {
      toast.error("Erro ao salvar venda: " + error.message);
      return;
    }
    toast.success("Venda registrada!");
    navigate({ to: "/vendas" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Venda PAP</CardTitle>
        <CardDescription>Registro para o canal Porta a Porta.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
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
            <Field label="Cidade">
              <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
            </Field>
            <Field label="Bairro">
              <Input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
            </Field>
            <Field label="Data da venda" required>
              <Input
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
                required
              />
            </Field>
            <Field label="Produto">
              <Input
                value={form.produto}
                onChange={(e) => setForm({ ...form, produto: e.target.value })}
                placeholder="Ex: Fibra 500Mb"
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
            <Field label="Status" required>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="em_analise">Em análise</SelectItem>
                  <SelectItem value="instalado">Instalado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
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
