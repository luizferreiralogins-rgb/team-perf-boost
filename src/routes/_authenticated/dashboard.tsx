import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Target, Award, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Unifique Comercial" },
      { name: "description", content: "Acompanhe suas vendas, comissões e metas do mês." },
    ],
  }),
  component: Dashboard,
});

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-mes"],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user!.id;
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);

      const [{ data: profile }, loja, pap] = await Promise.all([
        supabase.from("profiles").select("canal, nome").eq("id", uid).maybeSingle(),
        supabase
          .from("vendas_loja")
          .select("valor_novo, status, data_venda")
          .eq("consultor_id", uid)
          .gte("data_venda", inicioMes.toISOString()),
        supabase
          .from("vendas_pap")
          .select("valor_venda, status, data_venda")
          .eq("consultor_id", uid)
          .gte("data_venda", inicioMes.toISOString()),
      ]);

      const canal = (profile?.canal ?? "loja") as "loja" | "pap";
      const vendas = canal === "loja" ? loja.data ?? [] : pap.data ?? [];
      const total = vendas.length;
      const instaladas = vendas.filter((v: any) => v.status === "instalado").length;
      const receita = vendas.reduce(
        (s: number, v: any) => s + Number(v.valor_novo ?? v.valor_venda ?? 0),
        0,
      );
      return { canal, total, instaladas, receita, nome: profile?.nome ?? "" };
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Painel do consultor</p>
          <h1 className="text-3xl font-bold tracking-tight">
            Olá{data?.nome ? `, ${data.nome.split(" ")[0]}` : ""} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aqui está um resumo do seu mês em{" "}
            <span className="font-semibold text-foreground">
              {data?.canal === "pap" ? "PAP" : "Loja"}
            </span>
            .
          </p>
        </div>
        <Button asChild size="lg">
          <Link to="/vendas/nova">
            <Plus className="mr-2 h-4 w-4" /> Nova venda
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Vendas no mês"
          value={isLoading ? null : String(data?.total ?? 0)}
          icon={TrendingUp}
        />
        <StatCard
          title="Instaladas"
          value={isLoading ? null : String(data?.instaladas ?? 0)}
          icon={Award}
        />
        <StatCard
          title="Receita gerada"
          value={isLoading ? null : brl(data?.receita ?? 0)}
          icon={Target}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Próximos passos</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Cadastre suas vendas do dia em <Link to="/vendas/nova" className="text-primary underline">Nova venda</Link>.</p>
          <p>• Consulte o histórico em <Link to="/vendas" className="text-primary underline">Vendas</Link>.</p>
          <p>• A comissão é calculada automaticamente quando a venda é marcada como <span className="font-semibold text-foreground">instalada</span>.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string | null;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        {value === null ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}
