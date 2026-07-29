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
  // "YYYY-MM-DD" -> "YYYY-MM"
  return d.slice(0, 7);
}

const statusEnum = z.enum(["pendente", "instalado", "cancelado", "em_analise"]);
type Status = z.infer<typeof statusEnum>;

const commonBase = {
  nome_cliente: z.string().trim().min(2, "Informe o nome do cliente").max(120),
  cpf_cnpj: z.string().trim().max(20).optional().or(z.literal("")),
  data: z.string().min(1, "Informe a data"),
  observacoes: z.string().max(500).optional().or(z.literal("")),
  status: statusEnum,
};

const lojaSchema = z.object({
  ...commonBase,
  valor_novo: z.coerce.number().positive("Valor deve ser maior que zero"),
  valor_antigo: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  tecnologia: z.string().max(60).optional().or(z.literal("")),
  contem_movel: z.boolean(),
});

const papSchema = z.object({
  ...commonBase,
  valor: z.coerce.number().positive("Valor deve ser maior que zero"),
  cidade: z.string().trim().max(80).optional().or(z.literal("")),
  bairro: z.string().trim().max(80).optional().or(z.literal("")),
  produto: z.string().trim().max(60).optional().or(z.literal("")),
});

function NovaVenda() {
  const canalQ = useCanal();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/vendas">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Nova venda</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Preencha os dados abaixo. A comissão é calculada na instalação.
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
    nome_cliente: "",
    cpf_cnpj: "",
    data: today(),
    valor_novo: "",
    valor_antigo: "",
    tecnologia: "Fibra",
    contem_movel: false,
    status: "pendente" as Status,
    observacoes: "",
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
    const { error } = await supabase.from("vendas_loja").insert({
      vendedor_id: uid,
      nome_cliente: parsed.data.nome_cliente,
      cpf_cnpj: parsed.data.cpf_cnpj || null,
      data_abertura: parsed.data.data,
      mes_ref: mesRefFromDate(parsed.data.data),
      valor_novo: parsed.data.valor_novo,
      valor_antigo:
        typeof parsed.data.valor_antigo === "number" ? parsed.data.valor_antigo : null,
      tecnologia: parsed.data.tecnologia || null,
      contem_movel: parsed.data.contem_movel,
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
        <CardTitle>Venda de Loja</CardTitle>
        <CardDescription>Registro para o canal Loja.</CardDescription>
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
            <Field label="Data de abertura" required>
              <Input
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
                required
              />
            </Field>
            <Field label="Tecnologia">
              <Input
                value={form.tecnologia}
                onChange={(e) => setForm({ ...form, tecnologia: e.target.value })}
              />
            </Field>
            <Field label="Valor do plano novo (R$)" required>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.valor_novo}
                onChange={(e) => setForm({ ...form, valor_novo: e.target.value })}
                required
              />
            </Field>
            <Field label="Valor do plano antigo (R$)" hint="Em branco = cliente novo.">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.valor_antigo}
                onChange={(e) => setForm({ ...form, valor_antigo: e.target.value })}
              />
            </Field>
            <Field label="Contém plano móvel?">
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
