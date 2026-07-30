import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ParamTable } from "@/components/regras/param-table";

export const Route = createFileRoute("/_authenticated/regras-comissionamento")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getUser();
    const uid = sess.user?.id;
    if (!uid) throw redirect({ to: "/auth" });
  },
  component: RegrasPage,
  head: () => ({
    meta: [
      { title: "Regras de Comissionamento | Unifique" },
      {
        name: "description",
        content:
          "Consulte e edite as tabelas de comissionamento de Loja e PAP diretamente pelos campos.",
      },
      { property: "og:title", content: "Regras de Comissionamento | Unifique" },
      {
        property: "og:description",
        content: "Tabelas editáveis de faixas, metas e novos produtos para Loja e PAP.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function useGestor() {
  return useQuery({
    queryKey: ["me-gestor-regras"],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) return false;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      return (data ?? []).some(
        (r) => r.role === "gerente" || r.role === "regional" || r.role === "admin",
      );
    },
  });
}

function RegrasPage() {
  const gestorQ = useGestor();
  const editavel = !!gestorQ.data;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Regras de Comissionamento</h1>
        <p className="text-sm text-muted-foreground">
          Consulte e ajuste as regras alterando diretamente os campos das tabelas.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          As alterações valem <b>somente para novas vendas</b>. As vendas já registradas mantêm a
          comissão calculada pelas regras vigentes na data do registro.
          {!editavel && " Seu perfil pode apenas consultar as regras."}
        </span>
      </div>

      <Tabs defaultValue="loja">
        <TabsList>
          <TabsTrigger value="loja">Loja</TabsTrigger>
          <TabsTrigger value="pap">PAP</TabsTrigger>
        </TabsList>

        <TabsContent value="loja" className="space-y-6 pt-4">
          <ParamTable
            table="parametros_loja_metas"
            title="Faixas × Meta % Renovações c/ móvel"
            description="Faixa efetiva do consultor no mês."
            pk="faixa"
            orderBy="faixa"
            editavel={editavel}
            novoPadrao={{ faixa: 1, meta_renov_movel: 0, meta_receita: 0 }}
            cols={[
              { key: "faixa", label: "Faixa", kind: "number", lockOnEdit: true, width: "80px" },
              { key: "meta_renov_movel", label: "Meta % renov. c/ móvel", kind: "percent" },
              { key: "meta_receita", label: "Meta receita (R$)", kind: "currency" },
            ]}
          />

          <ParamTable
            table="parametros_loja_faixas_ticket"
            title="Diferença de ticket — Banda Larga e Móvel Pós Pago"
            description="Valor pago por protocolo conforme a diferença (valor novo − valor antigo)."
            pk="id"
            orderBy="diff_de"
            editavel={editavel}
            novoPadrao={{ diff_de: 0, diff_ate: 0, faixa_0: 0, faixa_1: 0, faixa_2: 0, faixa_3: 0 }}
            cols={[
              { key: "diff_de", label: "De (R$)", kind: "currency" },
              { key: "diff_ate", label: "Até (R$)", kind: "currency" },
              { key: "faixa_0", label: "Faixa 0 (R$)", kind: "currency" },
              { key: "faixa_1", label: "Faixa 1 (R$)", kind: "currency" },
              { key: "faixa_2", label: "Faixa 2 (R$)", kind: "currency" },
              { key: "faixa_3", label: "Faixa 3 (R$)", kind: "currency" },
            ]}
          />

          <ParamTable
            table="parametros_loja_novos_produtos"
            title="Produtos — % de comissão"
            pk="codigo"
            orderBy="codigo"
            editavel={editavel}
            novoPadrao={{ codigo: "", nome: "", percentual: 0 }}
            cols={[
              { key: "codigo", label: "Código", kind: "text", lockOnEdit: true },
              { key: "nome", label: "Produto", kind: "text" },
              { key: "percentual", label: "% Comissão", kind: "percent" },
            ]}
          />
        </TabsContent>

        <TabsContent value="pap" className="space-y-6 pt-4">
          <ParamTable
            table="parametros_pap_faixas"
            title="Tabela 8.1 — Metas de ativações (comissionamento padrão)"
            pk="id"
            orderBy="receita_de"
            editavel={editavel}
            novoPadrao={{
              faixa: 1,
              receita_de: 0,
              receita_ate: 0,
              pct_comissao: 0,
              meta_max_cancel: 0.08,
              acelerador_baixo_cancel: 0.05,
              bonus_venda_indireta: 0,
            }}
            cols={[
              { key: "faixa", label: "Faixa", kind: "number", width: "80px" },
              { key: "receita_de", label: "De (R$)", kind: "currency" },
              { key: "receita_ate", label: "Até (R$)", kind: "currency" },
              { key: "pct_comissao", label: "% Comissão ativações", kind: "percent" },
              { key: "meta_max_cancel", label: "Meta máx. cancel. (D+5)", kind: "percent" },
              { key: "acelerador_baixo_cancel", label: "Acelerador baixo cancel.", kind: "percent" },
              { key: "bonus_venda_indireta", label: "Bônus venda indireta", kind: "percent" },
            ]}
          />

          <ParamTable
            table="parametros_pap_novos_produtos"
            title="Tabela 8.2 — Comissionamento de novos produtos"
            pk="codigo"
            orderBy="nome"
            editavel={editavel}
            novoPadrao={{ codigo: "", nome: "", percentual: 0, limitado: false, limite: 999999999 }}
            cols={[
              { key: "codigo", label: "Código", kind: "text", lockOnEdit: true },
              { key: "nome", label: "Produto", kind: "text" },
              { key: "percentual", label: "% Comissionamento", kind: "percent" },
              { key: "limitado", label: "Limitado por venda?", kind: "bool" },
              { key: "limite", label: "Limite (R$)", kind: "currency" },
            ]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
