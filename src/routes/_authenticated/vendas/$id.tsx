import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  FormLoja,
  FormPap,
  type FormLojaState,
  type FormPapState,
} from "./nova";
import { HistoricoReagendamentos } from "@/components/vendas/reagendamento";
import { isIndiqueGanhe, type Indicador } from "@/components/vendas/indicador";

export const Route = createFileRoute("/_authenticated/vendas/$id")({
  head: () => ({
    meta: [
      { title: "Editar venda — Uni4Consult" },
      { name: "description", content: "Edite uma venda registrada." },
      { property: "og:title", content: "Editar venda — Uni4Consult" },
      { property: "og:description", content: "Edite uma venda registrada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditarVenda,
});

type Loaded =
  | { canal: "loja"; ownerId: string; state: FormLojaState; indicador?: Indicador }
  | { canal: "pap"; ownerId: string; state: FormPapState; indicador?: Indicador }
  | null;

async function carregarIndicador(vendedorId: string, nome: string, canal: string | null) {
  if (!isIndiqueGanhe(canal ?? "")) return undefined;
  const { data, error } = await supabase.from("indicacoes")
    .select("cliente_nome, cliente_cpf, cliente_telefone, indicado_nome")
    .eq("vendedor_id", vendedorId);
  if (error) throw error;
  const matches = (data ?? []).filter((r) => r.indicado_nome.trim().toLowerCase() === nome.trim().toLowerCase());
  if (matches.length !== 1) return undefined;
  const row = matches[0];
  return { nome: row.cliente_nome, cpf: row.cliente_cpf, telefone: row.cliente_telefone ?? "" };
}

function EditarVenda() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const vendaQ = useQuery({
    queryKey: ["venda-edicao", id],
    queryFn: async (): Promise<Loaded> => {
      const { data: loja } = await supabase
        .from("vendas_loja")
        .select(
          "vendedor_id, protocolo, nome_cliente, telefone, observacoes, data_abertura, data_ativacao, data_agendamento, classe_protocolo, canal_origem, tecnologia, contem_movel, qtd_linhas, valor_novo, valor_antigo, status",
        )
        .eq("id", id)
        .maybeSingle();
      if (loja) {
        return {
          canal: "loja",
          ownerId: loja.vendedor_id,
          indicador: await carregarIndicador(loja.vendedor_id, loja.nome_cliente, loja.canal_origem),
          state: {
            protocolo: loja.protocolo ?? "",
            nome_cliente: loja.nome_cliente,
            telefone: loja.telefone ?? "",
            observacoes: loja.observacoes ?? "",
            data_abertura: loja.data_abertura ?? "",
            data_ativacao: loja.data_ativacao ?? "",
            data_agendamento: loja.data_agendamento ?? "",
            classe_protocolo: loja.classe_protocolo as FormLojaState["classe_protocolo"],
            canal_origem: loja.canal_origem ?? "",
            tecnologia: (loja.tecnologia ??
              "01.04 - Internet - Banda Larga - Fibra") as FormLojaState["tecnologia"],
            contem_movel: !!loja.contem_movel,
            qtd_linhas: String(loja.qtd_linhas ?? 0),
            valor_novo: String(loja.valor_novo ?? ""),
            valor_antigo: loja.valor_antigo == null ? "" : String(loja.valor_antigo),
            instalado: loja.status === "instalado",
          },
        };
      }

      const { data: pap } = await supabase
        .from("vendas_pap")
        .select(
          "vendedor_id, nome_cliente, telefone, protocolo, tipo_protocolo, canal_origem, data_venda, data_ativacao, data_agendamento, valor, valor_novo, valor_antigo, produto, qtd_linhas, status",
        )
        .eq("id", id)
        .maybeSingle();
      if (!pap) return null;
      return {
        canal: "pap",
        ownerId: pap.vendedor_id,
        indicador: await carregarIndicador(pap.vendedor_id, pap.nome_cliente, pap.canal_origem),
        state: {
          protocolo: pap.protocolo ?? "",
          tipo_protocolo: (pap.tipo_protocolo ?? "Novo Acesso") as FormPapState["tipo_protocolo"],
          canal_origem: pap.canal_origem ?? "",
          nome_cliente: pap.nome_cliente,
          telefone: pap.telefone ?? "",
          produto: (pap.produto ?? "Banda Larga") as FormPapState["produto"],
          data: pap.data_venda,
          data_instalacao: pap.data_ativacao ?? "",
          data_agendamento: pap.data_agendamento ?? "",
          valor_novo: String(pap.valor_novo || pap.valor || ""),
          valor_antigo: pap.valor_antigo ? String(pap.valor_antigo) : "",
          qtd_linhas: String(pap.qtd_linhas ?? 0),
          instalado: pap.status === "instalado",
        },
      };
    },
  });

  const venda = vendaQ.data;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/historico">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Editar venda</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ajuste os dados e salve para recalcular a comissão automaticamente.
        </p>
      </div>

      {vendaQ.isLoading ? (
        <Card>
          <CardContent className="p-8 text-sm text-muted-foreground">Carregando...</CardContent>
        </Card>
      ) : !venda ? (
        <Card>
          <CardContent className="space-y-4 p-8 text-center text-sm text-muted-foreground">
            <p>Venda não encontrada ou você não tem permissão para editá-la.</p>
            <Button onClick={() => navigate({ to: "/historico" })}>Voltar ao histórico</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {venda.canal === "pap" ? (
            <FormPap key={id} editingId={id} ownerId={venda.ownerId} initial={venda.state} indicadorInicial={venda.indicador} />
          ) : (
            <FormLoja key={id} editingId={id} ownerId={venda.ownerId} initial={venda.state} indicadorInicial={venda.indicador} />
          )}
          <HistoricoReagendamentos
            tabela={venda.canal === "pap" ? "vendas_pap" : "vendas_loja"}
            vendaId={id}
          />
        </>
      )}
    </div>
  );
}
