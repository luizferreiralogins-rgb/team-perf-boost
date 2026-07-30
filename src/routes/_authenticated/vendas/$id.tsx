import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  FormLoja,
  FormPap,
  useCanal,
  type FormLojaState,
  type FormPapState,
} from "./nova";

export const Route = createFileRoute("/_authenticated/vendas/$id")({
  head: () => ({
    meta: [
      { title: "Editar venda — Unifique Comercial" },
      { name: "description", content: "Edite uma venda registrada." },
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
  component: EditarVenda,
});

function EditarVenda() {
  const { id } = Route.useParams();
  const canalQ = useCanal();
  const navigate = useNavigate();

  const loja = useQuery({
    enabled: canalQ.data === "loja",
    queryKey: ["venda-loja", id],
    queryFn: async (): Promise<FormLojaState | null> => {
      const { data, error } = await supabase
        .from("vendas_loja")
        .select(
          "protocolo, nome_cliente, cpf_cnpj, observacoes, data_abertura, data_ativacao, classe_protocolo, tecnologia, contem_movel, qtd_linhas, valor_novo, valor_antigo, status",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        protocolo: data.protocolo ?? "",
        nome_cliente: data.nome_cliente,
        cpf_cnpj: data.cpf_cnpj ?? "",
        observacoes: data.observacoes ?? "",
        data_abertura: data.data_abertura ?? "",
        data_ativacao: data.data_ativacao ?? "",
        classe_protocolo: data.classe_protocolo as FormLojaState["classe_protocolo"],
        tecnologia: (data.tecnologia ?? "01.04 - Internet - Banda Larga - Fibra") as FormLojaState["tecnologia"],
        contem_movel: !!data.contem_movel,
        qtd_linhas: String(data.qtd_linhas ?? 0),
        valor_novo: String(data.valor_novo ?? ""),
        valor_antigo: data.valor_antigo == null ? "" : String(data.valor_antigo),
        instalado: data.status === "instalado",
      };
    },
  });

  const pap = useQuery({
    enabled: canalQ.data === "pap",
    queryKey: ["venda-pap", id],
    queryFn: async (): Promise<FormPapState | null> => {
      const { data, error } = await supabase
        .from("vendas_pap")
        .select("nome_cliente, protocolo, tipo_protocolo, data_venda, data_ativacao, valor, produto, status")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        protocolo: data.protocolo ?? "",
        tipo_protocolo: (data.tipo_protocolo ?? "Novo Acesso") as FormPapState["tipo_protocolo"],
        nome_cliente: data.nome_cliente,
        produto: (data.produto ?? "Banda Larga") as FormPapState["produto"],
        data: data.data_venda,
        data_instalacao: data.data_ativacao ?? "",
        valor: String(data.valor ?? ""),
        instalado: data.status === "instalado",
      };
    },
  });

  const loading = canalQ.isLoading || loja.isLoading || pap.isLoading;
  const initial = canalQ.data === "loja" ? loja.data : pap.data;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/vendas">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Editar venda</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ajuste os dados e salve para recalcular a comissão automaticamente.
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-8 text-sm text-muted-foreground">Carregando...</CardContent>
        </Card>
      ) : !initial ? (
        <Card>
          <CardContent className="space-y-4 p-8 text-center text-sm text-muted-foreground">
            <p>Venda não encontrada ou você não tem permissão para editá-la.</p>
            <Button onClick={() => navigate({ to: "/vendas" })}>Voltar às vendas</Button>
          </CardContent>
        </Card>
      ) : canalQ.data === "pap" ? (
        <FormPap editingId={id} initial={initial as FormPapState} />
      ) : (
        <FormLoja editingId={id} initial={initial as FormLojaState} />
      )}
    </div>
  );
}
