import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Target, Award, Plus, Wifi, Smartphone, RefreshCw, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FiltrosBar,
  RankingEquipe,
  aplicarFiltros,
  mesAtual,
  useEquipe,
  type Filtros,
} from "@/components/dashboard/filtros-ranking";
import { NaoInstaladasDialog } from "@/components/dashboard/nao-instaladas-dialog";
import { LeadsResumo } from "@/components/dashboard/leads-resumo";
import { AgendamentosVencidos } from "@/components/vendas/agendamentos-vencidos";

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

/** Fator de projeção: dias totais do mês / dias decorridos (1 se mês passado/futuro). */
function fatorProjecao(mesISO: string) {
  const [y, m] = mesISO.split("-").map(Number);
  const hoje = new Date();
  const diasTotais = new Date(y, m, 0).getDate();
  if (y !== hoje.getFullYear() || m !== hoje.getMonth() + 1) return 1;
  const diasAtuais = Math.max(1, hoje.getDate());
  return diasTotais / diasAtuais;
}


function Dashboard() {
  const { data: roleInfo } = useQuery({
    queryKey: ["me-roles"],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) return { isGestor: false, role: "consultor", uid: undefined as string | undefined };
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const list = (roles ?? []).map((r) => r.role);
      const role = list.includes("admin")
        ? "admin"
        : list.includes("regional")
          ? "regional"
          : list.includes("gerente")
            ? "gerente"
            : "consultor";
      return {
        isGestor: role !== "consultor",
        role,
        uid,
      };
    },
    staleTime: 30_000,
  });
  const isGestor = roleInfo?.isGestor ?? false;
  const role = roleInfo?.role ?? "consultor";

  const [verNaoInstaladas, setVerNaoInstaladas] = useState(false);
  const [filtros, setFiltros] = useState<Filtros>({ mes: mesAtual(), pessoa: "all", unidade: "all" });
  const { data: membros } = useEquipe(roleInfo?.uid, isGestor ? role : undefined);
  const escopoIds = useMemo(
    () => (membros ? aplicarFiltros(membros, filtros, role).map((m) => m.id) : []),
    [membros, filtros, role],
  );
  const fatorProj = useMemo(
    () => fatorProjecao(isGestor ? filtros.mes : mesAtual()),
    [isGestor, filtros.mes],
  );



  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-mes", isGestor, filtros.mes, escopoIds.join(",")],
    enabled: !isGestor || !!membros,
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user!.id;
      const mesRefISO = isGestor
        ? `${filtros.mes}-01`
        : (() => {
            const hoje = new Date();
            return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
          })();

      const lojaQ = supabase
        .from("vendas_loja")
        .select("valor_novo, status, mes_ref, comissao, tecnologia, classe_protocolo, contem_movel")
        .eq("mes_ref", mesRefISO);
      const papQ = supabase
        .from("vendas_pap")
        .select("valor, status, mes_ref, comissao, tecnologia")
        .eq("mes_ref", mesRefISO);
      if (!isGestor) {
        lojaQ.eq("vendedor_id", uid);
        papQ.eq("vendedor_id", uid);
      } else {
        lojaQ.in("vendedor_id", escopoIds.length ? escopoIds : ["00000000-0000-0000-0000-000000000000"]);
        papQ.in("vendedor_id", escopoIds.length ? escopoIds : ["00000000-0000-0000-0000-000000000000"]);
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
      const naoInstaladas = vendas.filter(
        (v) => v.status !== "instalado" && v.status !== "cancelado",
      ).length;

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
        canal, total, instaladas, naoInstaladas, receita, comissao, nome: profile?.nome ?? "",
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
            <Link to="/vendas/nova" search={{}}>
              <Plus className="mr-2 h-4 w-4" /> Nova venda
            </Link>
          </Button>
        )}
      </div>

      {isGestor && membros && (
        <FiltrosBar role={role} membros={membros} filtros={filtros} onChange={setFiltros} />
      )}

      <AgendamentosVencidos
        escopoIds={isGestor ? escopoIds : undefined}
        uid={isGestor ? undefined : roleInfo?.uid}
        nomes={Object.fromEntries((membros ?? []).map((m) => [m.id, m.nome]))}
      />

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard title="Vendas no mês" value={isLoading ? null : String(data?.total ?? 0)} icon={TrendingUp} />
        <StatCard title="Instaladas" value={isLoading ? null : String(data?.instaladas ?? 0)} icon={Award} />
        <StatCard
          title="Não instaladas"
          value={isLoading ? null : String(data?.naoInstaladas ?? 0)}
          icon={Clock}
          onClick={() => setVerNaoInstaladas(true)}
        />
        <StatCard title="Receita gerada" value={isLoading ? null : brl(data?.receita ?? 0)} icon={Target} />
        <StatCard
          title="Comissão estimada"
          value={isLoading ? null : brl(data?.comissao ?? 0)}
          icon={Target}
          projecao={isLoading ? null : `Projeção: ${brl((data?.comissao ?? 0) * fatorProj)}`}
        />
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
            fator={fatorProj}
          />
          <KpiCard
            title="Móvel"
            qtd={isLoading ? null : data?.mvQtd ?? 0}
            valor={isLoading ? null : data?.mvRs ?? 0}
            icon={Smartphone}
            fator={fatorProj}
          />
          <KpiCard
            title="Renovações"
            qtd={isLoading ? null : data?.rvQtd ?? 0}
            valor={isLoading ? null : data?.rvRs ?? 0}
            icon={RefreshCw}
            fator={fatorProj}
            projecaoEm="rs"
          />

        </div>
      </div>

      <LeadsResumo isGestor={isGestor} uid={roleInfo?.uid} escopoIds={escopoIds} />

      {isGestor && membros && (
        <RankingEquipe role={role} membros={membros} filtros={filtros} />
      )}

      {isGestor && <ProdutividadeTime />}

      <NaoInstaladasDialog
        open={verNaoInstaladas}
        onOpenChange={setVerNaoInstaladas}
        isGestor={isGestor}
        uid={roleInfo?.uid}
        canalConsultor={data?.canal}
        escopoIds={escopoIds}
        mesRefISO={
          isGestor
            ? `${filtros.mes}-01`
            : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`
        }
      />


      {!isGestor && (
        <Card>
          <CardHeader>
            <CardTitle>Próximos passos</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>• Cadastre suas vendas do dia em <Link to="/vendas/nova" search={{}} className="text-primary underline">Nova venda</Link>.</p>
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
  onClick,
  projecao,
}: {
  title: string;
  value: string | null;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  projecao?: string | null;
}) {
  return (
    <Card
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={onClick ? "cursor-pointer transition-colors hover:border-primary/50 hover:bg-accent/40" : undefined}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        {value === null ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{value}</div>}
        {projecao !== undefined && (
          projecao === null ? (
            <Skeleton className="mt-2 h-4 w-28" />
          ) : (
            <p className="mt-2 text-xs font-medium text-muted-foreground">{projecao}</p>
          )
        )}
      </CardContent>
    </Card>
  );
}


function KpiCard({
  title,
  qtd,
  valor,
  icon: Icon,
  fator = 1,
  projecaoEm = "qtd",
}: {
  title: string;
  qtd: number | null;
  valor: number | null;
  icon: React.ComponentType<{ className?: string }>;
  fator?: number;
  projecaoEm?: "qtd" | "rs";
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
            {brl(valor)}
          </div>
        )}
        {qtd !== null && valor !== null && (
          <p className="pt-1 text-xs font-medium text-muted-foreground">
            Projeção:{" "}
            {projecaoEm === "qtd"
              ? `${Math.round(qtd * fator)} vendas`
              : brl(valor * fator)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}



function ProdutividadeTime() {
  const hoje = new Date();
  const inicioMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
  const fimMes = (() => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const { data, isLoading } = useQuery({
    queryKey: ["produtividade-time", inicioMes],
    queryFn: async () => {
      const [atend, loja, pap, leads, profs] = await Promise.all([
        supabase
          .from("atendimentos")
          .select("usuario_id")
          .gte("data_atendimento", inicioMes)
          .lte("data_atendimento", fimMes),
        supabase.from("vendas_loja").select("vendedor_id").gte("created_at", `${inicioMes}T00:00:00`),
        supabase.from("vendas_pap").select("vendedor_id").gte("created_at", `${inicioMes}T00:00:00`),
        supabase
          .from("leads")
          .select("vendedor_id, created_at, updated_at")
          .or(`created_at.gte.${inicioMes}T00:00:00,updated_at.gte.${inicioMes}T00:00:00`),
        supabase.from("profiles").select("id, nome"),
      ]);

      const nomes = new Map((profs.data ?? []).map((p) => [p.id, p.nome || "—"]));
      const linhas = new Map<string, { atendimentos: number; vendas: number; leads: number }>();
      const bump = (id: string, k: "atendimentos" | "vendas" | "leads", n = 1) => {
        const cur = linhas.get(id) ?? { atendimentos: 0, vendas: 0, leads: 0 };
        cur[k] += n;
        linhas.set(id, cur);
      };
      for (const a of atend.data ?? []) bump(a.usuario_id, "atendimentos");
      for (const v of [...(loja.data ?? []), ...(pap.data ?? [])]) bump(v.vendedor_id, "vendas");
      for (const l of leads.data ?? []) {
        const dia = (s: string) => s.slice(0, 10);
        bump(l.vendedor_id, "leads", dia(l.created_at) !== dia(l.updated_at) ? 2 : 1);
      }

      return [...linhas.entries()]
        .map(([id, v]) => ({
          id,
          nome: nomes.get(id) ?? "—",
          ...v,
          total: v.atendimentos + v.vendas + v.leads,
        }))
        .sort((a, b) => b.total - a.total);
    },
  });

  const diasDecorridos = Math.max(1, hoje.getDate());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Produtividade do time — mês atual</CardTitle>
        <CardDescription>
          Total do mês e média diária (dividida pelos {diasDecorridos} dias decorridos).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <Skeleton className="h-24 w-full" />}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma atividade registrada neste mês.</p>
        )}
        {(data ?? []).map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
            <span className="font-medium">{l.nome}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {l.atendimentos} atend. · {l.vendas} vendas · {l.leads} leads
            </span>
            <span className="w-20 text-right">
              <span className="block text-lg font-bold leading-none">{l.total}</span>
              <span className="block text-[11px] text-muted-foreground">
                {(l.total / diasDecorridos).toFixed(1)}/dia
              </span>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
