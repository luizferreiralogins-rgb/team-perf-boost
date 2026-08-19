import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Target, Award, Plus, Wifi, Smartphone, RefreshCw, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatarMinutos, mapaTempos, useTempos } from "@/hooks/use-tempos";
import { fraseAniversario, useAniversariantes } from "@/hooks/use-aniversariantes";


import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useFaixaAtual, useFaixasEquipe, rotuloFaixa } from "@/lib/faixa-atual";
import { metasConsultor, metasEquipe } from "@/lib/metas-kpi";


import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FiltrosBar,
  RankingEquipe,
  aplicarFiltros,
  mesAtual,
  mesesRecentes,
  useEquipe,
  type Filtros,
} from "@/components/dashboard/filtros-ranking";
import { RankingTime } from "@/components/dashboard/ranking-time";
import { NaoInstaladasDialog } from "@/components/dashboard/nao-instaladas-dialog";
import { LeadsResumo } from "@/components/dashboard/leads-resumo";
import { Estrategico } from "@/components/dashboard/estrategico";
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

/** Frase com o ritmo diário necessário para bater as metas do mês. */
function RitmoDiario({
  mes,
  metas,
  semRenovacao,
  bl,
  movel,
  renovRs,
  faixa,
}: {
  mes: string;
  metas: { bl: number; movel: number; renovRs: number };
  semRenovacao: boolean;
  bl: number;
  movel: number;
  renovRs: number;
  faixa?: { canal: "loja" | "pap"; faixa: number; proxima: { movel: number; receita: number } | null } | null;
}) {
  const aniversarios = fraseAniversario(useAniversariantes().data);
  const [y, m] = mes.split("-").map(Number);
  const hoje = new Date();
  const mesCorrente = y === hoje.getFullYear() && m === hoje.getMonth() + 1;

  const diasTotais = new Date(y, m, 0).getDate();
  const diasRestantes = Math.max(1, diasTotais - hoje.getDate() + 1);
  const porDia = (meta: number, feito: number) =>
    Math.max(0, Math.ceil((Math.max(0, meta - feito) / diasRestantes) * 100) / 100);

  const dBl = Math.ceil(porDia(metas.bl, bl));
  const dMv = Math.ceil(porDia(metas.movel, movel));
  const dRv = porDia(metas.renovRs, renovRs);

  const partes: string[] = [];
  if (metas.bl > 0) partes.push(`${dBl} Banda Larga`);
  if (metas.movel > 0) partes.push(`${dMv} Móvel`);
  if (!semRenovacao && metas.renovRs > 0)
    partes.push(`${brl(Math.ceil(dRv))} em Renovações`);
  const semFrase = !mesCorrente || !partes.length;
  if (semFrase && !aniversarios) return null;


  const lista =
    partes.length > 1
      ? `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`
      : partes[0];

  const batido = dBl === 0 && dMv === 0 && (semRenovacao || dRv === 0);

  // Complemento: o que falta para avançar de faixa.
  let faixaTexto: string | null = null;
  if (faixa) {
    if (!faixa.proxima) {
      faixaTexto = "Você já está na faixa máxima de comissionamento.";
    } else {
      const itens: string[] = [];
      if (faixa.canal === "loja" && faixa.proxima.movel > 0)
        itens.push(
          `mais ${faixa.proxima.movel} ${faixa.proxima.movel === 1 ? "Móvel" : "Móveis"}`,
        );
      if (faixa.proxima.receita > 0)
        itens.push(`${brl(Math.ceil(faixa.proxima.receita))} em Receita`);
      if (itens.length) {
        const listaFaixa =
          itens.length > 1 ? `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}` : itens[0];
        faixaTexto = `E para você avançar para a próxima faixa, é necessário entregar ${listaFaixa}.`;
      }
    }
  }

  return (
    <div className="min-w-[260px] flex-1 rounded-xl border bg-muted/30 p-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        {semFrase ? null : batido ? (
          <>
            🎉 Metas do mês já atingidas. Todo resultado a partir de agora é
            acelerador de comissão.
          </>
        ) : (
          <>
            Hoje, para estar dentro das projeções das suas metas do mês, você
            precisará entregar{" "}
            <span className="font-semibold text-foreground">{lista}</span>.
          </>
        )}

        {!semFrase && faixaTexto && (
          <> <span className="font-semibold text-foreground">{faixaTexto}</span></>
        )}
        {aniversarios && (
          <> <span className="font-semibold text-foreground">{aniversarios}</span></>
        )}

      </p>
    </div>
  );
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
          : list.includes("gerente") || list.includes("lider_pap")
            ? "gerente"
            : "consultor";
      return {
        isGestor: role !== "consultor",
        role,
        isLiderPap: list.includes("lider_pap") && !list.includes("gerente"),
        uid,
      };

    },
    staleTime: 30_000,
  });
  const isGestor = roleInfo?.isGestor ?? false;
  const role = roleInfo?.role ?? "consultor";

  const [verNaoInstaladas, setVerNaoInstaladas] = useState(false);
  const [aba, setAba] = useState<"comercial" | "estrategico">("comercial");
  const comercial = !isGestor || aba === "comercial";
  const [filtros, setFiltros] = useState<Filtros>({ mes: mesAtual(), pessoa: "all", unidade: "all" });
  const { data: membros } = useEquipe(roleInfo?.uid, isGestor ? role : undefined);
  const escopoIds = useMemo(
    () => (membros ? aplicarFiltros(membros, filtros, role).map((m) => m.id) : []),
    [membros, filtros, role],
  );
  const fatorProj = useMemo(() => fatorProjecao(filtros.mes), [filtros.mes]);


  const ehMesAtual = filtros.mes === mesAtual();
  /** Mês atual = mesmas vendas da aba Vendas (ativas, não arquivadas). */
  const usarAtivas = ehMesAtual;
  const faixaAtual = useFaixaAtual(isGestor ? undefined : roleInfo?.uid);




  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-mes", isGestor, filtros.mes, escopoIds.join(","), usarAtivas],
    enabled: !isGestor || !!membros,
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user!.id;
      const mesRefISO = `${filtros.mes}-01`;

      const lojaQ = supabase
        .from("vendas_loja")
        .select("valor_novo, valor_antigo, status, mes_ref, comissao, tecnologia, classe_protocolo, contem_movel, qtd_linhas");
      const papQ = supabase
        .from("vendas_pap")
        .select("valor, valor_novo, valor_antigo, status, mes_ref, comissao, tecnologia, produto, tipo_protocolo, qtd_linhas");
      if (usarAtivas) {
        lojaQ.is("arquivada_em", null);
        papQ.is("arquivada_em", null);
      } else {
        lojaQ.eq("mes_ref", mesRefISO);
        papQ.eq("mes_ref", mesRefISO);
      }
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

      // Receita = valor novo; quando há valor antigo, apenas a diferença de ticket
      const receitaLoja = (v: { valor_novo: number | null; valor_antigo: number | null }) => {
        const novo = Number(v.valor_novo ?? 0);
        const antigo = Number(v.valor_antigo ?? 0);
        return antigo > 0 ? novo - antigo : novo;
      };
      const receitaPap = (v: {
        valor: number | null;
        valor_novo: number | null;
        valor_antigo: number | null;
      }) => {
        const novo = Number(v.valor_novo ?? 0) || Number(v.valor ?? 0);
        const antigo = Number(v.valor_antigo ?? 0);
        return antigo > 0 ? novo - antigo : novo;
      };

      // Totais (respeitando canal do consultor; gestor vê ambos)
      const vendas = isGestor
        ? [
            ...lojaRows.map((v) => ({ status: v.status, valor: receitaLoja(v), comissao: Number(v.comissao ?? 0) })),
            ...papRows.map((v) => ({ status: v.status, valor: receitaPap(v), comissao: Number(v.comissao ?? 0) })),
          ]
        : canal === "loja"
          ? lojaRows.map((v) => ({ status: v.status, valor: receitaLoja(v), comissao: Number(v.comissao ?? 0) }))
          : papRows.map((v) => ({ status: v.status, valor: receitaPap(v), comissao: Number(v.comissao ?? 0) }));

      const total = vendas.length;
      const instaladas = vendas.filter((v) => v.status === "instalado").length;
      const naoInstaladas = vendas.filter(
        (v) => v.status !== "instalado" && v.status !== "cancelado",
      ).length;

      // Receita e comissão contabilizam apenas vendas instaladas
      const soInstaladas = vendas.filter((v) => v.status === "instalado");
      const receita = soInstaladas.reduce((s, v) => s + v.valor, 0);
      const comissao = soInstaladas.reduce((s, v) => s + v.comissao, 0);

      // KPIs por categoria
      const isBL = (t?: string | null) =>
        !!t && (/banda\s*larga/i.test(t) || /fibra|fttx|internet/i.test(t));
      const isMovel = (t?: string | null) => !!t && /m[óo]vel|movel|celular|5g|4g/i.test(t);

      const scopeLoja = isGestor || canal === "loja" ? lojaRows : [];
      const scopePap = isGestor || canal === "pap" ? papRows : [];

      let blQtd = 0, blInst = 0, blRs = 0;
      let mvQtd = 0, mvInst = 0, mvRs = 0;
      let mvLinhas = 0, mvLinhasInst = 0;
      let rvQtd = 0, rvInst = 0, rvRs = 0;

      for (const v of scopeLoja) {
        const inst = v.status === "instalado";
        const val = inst ? receitaLoja(v) : 0;
        const linhas = Number(v.qtd_linhas ?? 0);
        const renovLoja = (v.classe_protocolo ?? "").startsWith("Renovação");
        if (isBL(v.tecnologia) && !renovLoja) { blQtd++; if (inst) blInst++; blRs += val; }
        if (isMovel(v.tecnologia) || v.contem_movel || linhas > 0) {
          mvQtd++; if (inst) mvInst++; mvRs += val;
          mvLinhas += linhas; if (inst) mvLinhasInst += linhas;
        }
        if (renovLoja) { rvQtd++; if (inst) rvInst++; rvRs += val; }
      }
      for (const v of scopePap) {
        const inst = v.status === "instalado";
        const val = inst ? receitaPap(v) : 0;
        const desc = `${v.produto ?? ""} ${v.tecnologia ?? ""}`;
        const linhas = Number(v.qtd_linhas ?? 0);
        const temMovel = isMovel(desc) || linhas > 0;
        const renovPap = (v.tipo_protocolo ?? "").startsWith("Renovação");
        if (isBL(desc) && !renovPap) { blQtd++; if (inst) blInst++; blRs += val; }
        if (temMovel) {
          mvQtd++; if (inst) mvInst++; mvRs += val;
          mvLinhas += linhas; if (inst) mvLinhasInst += linhas;
        }
        if (renovPap) { rvQtd++; if (inst) rvInst++; rvRs += val; }
      }


      return {
        canal, total, instaladas, naoInstaladas, receita, comissao, nome: profile?.nome ?? "",
        blQtd, blInst, blRs,
        mvQtd, mvInst, mvRs, mvLinhas, mvLinhasInst,
        rvQtd, rvInst, rvRs,
      };

    },
  });

  const metasKpi = isGestor
    ? metasEquipe(membros ? aplicarFiltros(membros, filtros, role) : [])
    : metasConsultor(data?.canal);


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
        <RitmoDiario
          mes={filtros.mes}
          metas={metasKpi}
          semRenovacao={(roleInfo?.isLiderPap ?? false) || (!isGestor && data?.canal === "pap")}
          bl={data?.blInst ?? 0}
          movel={data?.mvLinhasInst ?? 0}
          renovRs={data?.rvRs ?? 0}
          faixa={!isGestor ? faixaAtual.data : null}
        />
        {!isGestor && (
          <div className="flex flex-col items-stretch gap-2">
            {faixaAtual.data && (
              <div className="space-y-0.5 rounded-lg border bg-muted/40 px-3 py-1.5 text-left text-xs leading-tight">
                {faixaAtual.data.canal === "pap" ? (
                  <p>
                    <span className="font-semibold text-foreground">
                      Faixa Receita Atual: {faixaAtual.data.faixa}/{faixaAtual.data.total}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {faixaAtual.data.proxReceita
                        ? `(Faltam ${brl(Math.ceil(faixaAtual.data.proxReceita.falta))} em Receita para a Faixa ${faixaAtual.data.proxReceita.faixa})`
                        : "(faixa máxima)"}
                    </span>
                  </p>
                ) : (
                  <>
                    <p className="font-semibold text-foreground">
                      Faixa Atual: {faixaAtual.data.faixa}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">
                        Faixa Atual Móvel: {(faixaAtual.data.pctMovel ?? 0).toFixed(0)}% —{" "}
                        {faixaAtual.data.faixaMovel ?? "—"}/{faixaAtual.data.total}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {faixaAtual.data.proxMovel
                          ? `(Faltam ${faixaAtual.data.proxMovel.falta} Móvel para a Faixa ${faixaAtual.data.proxMovel.faixa})`
                          : "(faixa máxima)"}
                      </span>
                    </p>
                    <p>
                      <span className="font-medium text-foreground">
                        Faixa Atual Receita: {faixaAtual.data.faixaReceita ?? "—"}/{faixaAtual.data.total}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {faixaAtual.data.proxReceita
                          ? `(Faltam ${brl(Math.ceil(faixaAtual.data.proxReceita.falta))} em Receita para a Faixa ${faixaAtual.data.proxReceita.faixa})`
                          : "(faixa máxima)"}
                      </span>
                    </p>
                  </>
                )}
              </div>
            )}
            <Button asChild size="lg">
              <Link to="/vendas/nova" search={{}}>
                <Plus className="mr-2 h-4 w-4" /> Nova venda
              </Link>
            </Button>
          </div>
        )}

      </div>


      {isGestor && (
        <div className="inline-flex rounded-lg border bg-muted/40 p-1">
          {(["comercial", "estrategico"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAba(a)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                aba === a
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {a === "comercial" ? "Comercial" : "Estratégico"}
            </button>
          ))}
        </div>
      )}

      {isGestor && aba === "estrategico" && <Estrategico />}

      {isGestor && aba === "comercial" && membros && (
        <FiltrosBar role={role} membros={membros} filtros={filtros} onChange={setFiltros} />
      )}


      {!isGestor && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 py-4">
            <Label className="text-sm text-muted-foreground">Mês</Label>
            <Select
              value={filtros.mes}
              onValueChange={(mes) => setFiltros((f) => ({ ...f, mes }))}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mesesRecentes(12).map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {ehMesAtual && (
              <span className="text-xs text-muted-foreground">
                Mês atual: considera todas as vendas da aba Vendas.
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {comercial && (
      <>
      <AgendamentosVencidos
        escopoIds={isGestor ? escopoIds : undefined}
        uid={isGestor ? undefined : roleInfo?.uid}
        nomes={Object.fromEntries((membros ?? []).map((m) => [m.id, m.nome]))}
      />

      <div className={`grid gap-4 md:grid-cols-3 ${isGestor ? "lg:grid-cols-5" : "lg:grid-cols-6"}`}>
        <StatCard title="Vendas no mês" value={isLoading ? null : String(data?.total ?? 0)} icon={TrendingUp} />
        <StatCard title="Instaladas" value={isLoading ? null : String(data?.instaladas ?? 0)} icon={Award} />
        <StatCard
          title="Não instaladas"
          value={isLoading ? null : String(data?.naoInstaladas ?? 0)}
          icon={Clock}
          onClick={() => setVerNaoInstaladas(true)}
        />
        {!isGestor && (
          <StatCard
            title="Faixa"
            value={
              faixaAtual.isLoading
                ? null
                : faixaAtual.data
                  ? `${faixaAtual.data.faixa}/${faixaAtual.data.total}`
                  : "—"
            }
            icon={Award}
            projecao={
              faixaAtual.isLoading
                ? null
                : faixaAtual.data
                  ? faixaAtual.data.canal === "pap"
                    ? `Receita: faixa ${faixaAtual.data.faixa}`
                    : `Móvel: faixa ${faixaAtual.data.faixaMovel ?? "—"} · Receita: faixa ${faixaAtual.data.faixaReceita ?? "—"}`
                  : ""
            }
          />
        )}
        <StatCard title="Receita gerada" value={isLoading ? null : brl(data?.receita ?? 0)} icon={Target} />
        <StatCard
          title="Comissão estimada"
          value={isLoading ? null : brl(data?.comissao ?? 0)}
          icon={Target}
          projecao={isLoading ? null : `Projeção: ${brl((data?.comissao ?? 0) * fatorProj)}`}
        />
      </div>

      {!isGestor && <RankingTime uid={roleInfo?.uid} mes={filtros.mes} />}




      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          KPIs por categoria
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <KpiCard
            title="Banda Larga"
            qtd={isLoading ? null : data?.blQtd ?? 0}
            qtdInst={isLoading ? null : data?.blInst ?? 0}
            valor={isLoading ? null : data?.blRs ?? 0}
            icon={Wifi}
            fator={fatorProj}
            meta={metasKpi.bl}
          />
          <KpiCard
            title="Móvel"
            qtd={isLoading ? null : data?.mvLinhas ?? 0}
            qtdInst={isLoading ? null : data?.mvLinhasInst ?? 0}
            valor={isLoading ? null : data?.mvRs ?? 0}
            icon={Smartphone}
            fator={fatorProj}
            meta={metasKpi.movel}
          />

          <KpiCard
            title="Renovações"
            qtd={isLoading ? null : data?.rvQtd ?? 0}
            qtdInst={isLoading ? null : data?.rvInst ?? 0}
            valor={isLoading ? null : data?.rvRs ?? 0}
            icon={RefreshCw}
            fator={fatorProj}
            projecaoEm="rs"
            meta={metasKpi.renovRs}
            metaEm="rs"
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
        ativas={usarAtivas}
        mesRefISO={`${filtros.mes}-01`}
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
      </>
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
  qtdInst,
  linhas,
  linhasInst,
  valor,
  icon: Icon,
  fator = 1,
  projecaoEm = "qtd",
  meta,
  metaEm = "qtd",
}: {
  title: string;
  qtd: number | null;
  qtdInst?: number | null;
  linhas?: number | null;
  linhasInst?: number | null;
  valor: number | null;
  icon: React.ComponentType<{ className?: string }>;
  fator?: number;
  projecaoEm?: "qtd" | "rs";
  meta?: number | null;
  metaEm?: "qtd" | "rs";
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
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold">Total {qtd}</span>
            <span className="text-sm font-semibold text-muted-foreground">
              Instaladas: {qtdInst ?? 0}
            </span>
          </div>
        )}

        {valor === null ? (
          <Skeleton className="mt-2 h-5 w-24" />
        ) : (
          <div className="pt-1 text-sm font-semibold text-primary">
            {brl(valor)}
          </div>
        )}
        {qtd !== null && valor !== null && (
          <div className="flex items-end justify-between gap-2 pt-1">
            <p className="text-xs font-medium text-muted-foreground">
              Projeção:{" "}
              {projecaoEm === "qtd"
                ? `${Math.round((qtdInst ?? qtd) * fator)} vendas`
                : brl(valor * fator)}
            </p>
            {meta != null && meta > 0 && (
              <p className="whitespace-nowrap rounded-md border border-border bg-muted/50 px-2 py-1 text-xs font-semibold">
                <span className="text-muted-foreground">Meta: </span>
                {metaEm === "rs" ? brl(meta) : meta}
              </p>
            )}
          </div>
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

  const tempos = useTempos();

  const { data, isLoading } = useQuery({
    queryKey: ["produtividade-time", inicioMes],
    queryFn: async () => {
      const [atend, loja, pap, leads, profs] = await Promise.all([
        supabase
          .from("atendimentos")
          .select("usuario_id, tipo")
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
      const linhas = new Map<
        string,
        { atendimentos: number; vendas: number; leads: number; tipos: Record<string, number> }
      >();
      const get = (id: string) => {
        const cur = linhas.get(id) ?? { atendimentos: 0, vendas: 0, leads: 0, tipos: {} };
        linhas.set(id, cur);
        return cur;
      };
      const bump = (id: string, k: "atendimentos" | "vendas" | "leads", n = 1) => {
        get(id)[k] += n;
      };
      for (const a of atend.data ?? []) {
        const cur = get(a.usuario_id);
        cur.atendimentos += 1;
        cur.tipos[a.tipo] = (cur.tipos[a.tipo] ?? 0) + 1;
      }
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
  const faixas = useFaixasEquipe((data ?? []).map((l) => l.id));


  const mapa = mapaTempos(tempos.data);
  const minutosDe = (l: {
    tipos: Record<string, number>;
    vendas: number;
    leads: number;
  }) =>
    Object.entries(l.tipos).reduce((s, [t, n]) => s + n * (mapa.get(t) ?? 0), 0) +
    l.vendas * (mapa.get("venda") ?? 0) +
    l.leads * (mapa.get("lead") ?? 0);

  const minutosTime = (data ?? []).reduce((s, l) => s + minutosDe(l), 0);

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
        {!isLoading && (data?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-8 rounded-md border border-border bg-muted/40 p-3">
            <div>
              <span className="block text-xs text-muted-foreground">
                Tempo produtivo do time — acumulado mês
              </span>
              <span className="text-xl font-bold">{formatarMinutos(minutosTime)}</span>
            </div>
            <div>
              <span className="block text-xs text-muted-foreground">
                Tempo produtivo do time — média dia
              </span>
              <span className="text-xl font-bold">
                {formatarMinutos(minutosTime / diasDecorridos)}
              </span>
            </div>
          </div>
        )}
        {(data ?? []).map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
            <span className="font-medium">{l.nome}</span>
            {faixas.data?.get(l.id) && (
              <Badge variant="outline" className="font-semibold">
                {faixas.data.get(l.id)!.canal === "pap" ? "PAP" : "Loja"} ·{" "}
                {rotuloFaixa(faixas.data.get(l.id))}
              </Badge>
            )}

            <span className="ml-auto text-xs text-muted-foreground">
              {l.atendimentos} atend. · {l.vendas} vendas · {l.leads} leads
              <br className="sm:hidden" />
              <span className="sm:ml-2">
                ⏱ {formatarMinutos(minutosDe(l))} · {formatarMinutos(minutosDe(l) / diasDecorridos)}
                /dia
              </span>
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

