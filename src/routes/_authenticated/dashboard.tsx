import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Target, Award, Plus, Wifi, Smartphone, RefreshCw } from "lucide-react";
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
  const { data: roleInfo } = useQuery({
    queryKey: ["me-roles"],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) return { isGestor: false };
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const list = (roles ?? []).map((r) => r.role);
      return { isGestor: list.some((r) => r === "gerente" || r === "regional" || r === "admin") };
    },
    staleTime: 30_000,
  });
  const isGestor = roleInfo?.isGestor ?? false;
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-mes", isGestor],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user!.id;
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);
      const inicioISO = inicioMes.toISOString().slice(0, 10);

      const lojaQ = supabase
        .from("vendas_loja")
        .select("valor_novo, status, data_abertura, comissao, tecnologia, classe_protocolo, contem_movel")
        .gte("data_abertura", inicioISO);
      const papQ = supabase
        .from("vendas_pap")
        .select("valor, status, data_venda, comissao, tecnologia")
        .gte("data_venda", inicioISO);
      if (!isGestor) {
        lojaQ.eq("vendedor_id", uid);
        papQ.eq("vendedor_id", uid);
      }

      const [{ data: profile }, loja, pap] = await Promise.all([
        supabase.from("profiles").select("canal, nome").eq("id", uid).maybeSingle(),
        lojaQ,
        papQ,
      ]);

      const canal = (profile?.canal ?? "loja") as "loja" | "pap";
      const lojaRows = loja.data ?? [];
      const papRows = pap.data ?? [];

      // Totais (respeitando canal do consultor; gestor vê ambos)
      const vendas = isGestor
        ? [
            ...lojaRows.map((v) => ({ status: v.status, valor: Number(v.valor_novo ?? 0), comissao: Number(v.comissao ?? 0) })),
            ...papRows.map((v) => ({ status: v.status, valor: Number(v.valor ?? 0), comissao: Number(v.comissao ?? 0) })),
          ]
        : canal === "loja"
          ? lojaRows.map((v) => ({ status: v.status, valor: Number(v.valor_novo ?? 0), comissao: Number(v.comissao ?? 0) }))
          : papRows.map((v) => ({ status: v.status, valor: Number(v.valor ?? 0), comissao: Number(v.comissao ?? 0) }));

      const total = vendas.length;
      const instaladas = vendas.filter((v) => v.status === "instalado").length;
      const receita = vendas.reduce((s, v) => s + v.valor, 0);
      const comissao = vendas.reduce((s, v) => s + v.comissao, 0);

      // KPIs por categoria
      const isBL = (t?: string | null) => !!t && /banda\s*larga/i.test(t);
      const isMovel = (t?: string | null) => !!t && /m[óo]vel/i.test(t);

      const scopeLoja = isGestor || canal === "loja" ? lojaRows : [];
      const scopePap = isGestor || canal === "pap" ? papRows : [];

      let blQtd = 0, blRs = 0;
      let mvQtd = 0, mvRs = 0;
      let rvQtd = 0, rvRs = 0;

      for (const v of scopeLoja) {
        const val = Number(v.valor_novo ?? 0);
        if (isBL(v.tecnologia)) { blQtd++; blRs += val; }
        if (isMovel(v.tecnologia) || v.contem_movel) { mvQtd++; mvRs += val; }
        if (v.classe_protocolo === "Renovação Contratual") { rvQtd++; rvRs += val; }
      }
      for (const v of scopePap) {
        const val = Number(v.valor ?? 0);
        if (isBL(v.tecnologia)) { blQtd++; blRs += val; }
        if (isMovel(v.tecnologia)) { mvQtd++; mvRs += val; }
      }

      return {
        canal, total, instaladas, receita, comissao, nome: profile?.nome ?? "",
        blQtd, blRs, mvQtd, mvRs, rvQtd, rvRs,
      };
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {isGestor ? "Painel de gestão" : "Painel do consultor"}
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            Olá{data?.nome ? `, ${data.nome.split(" ")[0]}` : ""} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isGestor ? (
              "Acompanhe os resultados do seu time."
            ) : (
              <>
                Aqui está um resumo do seu mês em{" "}
                <span className="font-semibold text-foreground">
                  {data?.canal === "pap" ? "PAP" : "Loja"}
                </span>
                .
              </>
            )}
          </p>
        </div>
        {!isGestor && (
          <Button asChild size="lg">
            <Link to="/vendas/nova">
              <Plus className="mr-2 h-4 w-4" /> Nova venda
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Vendas no mês" value={isLoading ? null : String(data?.total ?? 0)} icon={TrendingUp} />
        <StatCard title="Instaladas" value={isLoading ? null : String(data?.instaladas ?? 0)} icon={Award} />
        <StatCard title="Receita gerada" value={isLoading ? null : brl(data?.receita ?? 0)} icon={Target} />
        <StatCard title="Comissão estimada" value={isLoading ? null : brl(data?.comissao ?? 0)} icon={Target} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          KPIs por categoria
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <KpiCard
            title="Banda Larga"
            qtd={isLoading ? null : data?.blQtd ?? 0}
            valor={isLoading ? null : data?.blRs ?? 0}
            icon={Wifi}
          />
          <KpiCard
            title="Móvel"
            qtd={isLoading ? null : data?.mvQtd ?? 0}
            valor={isLoading ? null : data?.mvRs ?? 0}
            icon={Smartphone}
          />
          <KpiCard
            title="Renovações"
            qtd={isLoading ? null : data?.rvQtd ?? 0}
            valor={isLoading ? null : data?.rvRs ?? 0}
            icon={RefreshCw}
          />
        </div>
      </div>

      {!isGestor && (
        <Card>
          <CardHeader>
            <CardTitle>Próximos passos</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>• Cadastre suas vendas do dia em <Link to="/vendas/nova" className="text-primary underline">Nova venda</Link>.</p>
            <p>• Consulte o histórico em <Link to="/vendas" className="text-primary underline">Vendas</Link>.</p>
            <p>• A comissão é calculada quando a venda é marcada como <span className="font-semibold text-foreground">instalada</span>.</p>
          </CardContent>
        </Card>
      )}
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
        {value === null ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{value}</div>}
      </CardContent>
    </Card>
  );
}

function KpiCard({
  title,
  qtd,
  valor,
  icon: Icon,
}: {
  title: string;
  qtd: number | null;
  valor: number | null;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent className="space-y-1">
        {qtd === null ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <div className="text-2xl font-bold">{qtd}</div>
        )}
        <p className="text-xs text-muted-foreground">Qtd. de vendas</p>
        {valor === null ? (
          <Skeleton className="mt-2 h-5 w-24" />
        ) : (
          <div className="pt-1 text-sm font-semibold text-primary">
            {valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
