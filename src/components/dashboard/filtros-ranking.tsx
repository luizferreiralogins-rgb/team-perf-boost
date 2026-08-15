import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type Membro = {
  id: string;
  nome: string;
  canal: "loja" | "pap";
  loja_unidade: "norte" | "sul" | "shopping" | null;
  gerente_id: string | null;
  role: "consultor" | "gerente" | "lider_pap" | "regional" | "admin";
};

export type Filtros = {
  mes: string; // YYYY-MM
  pessoa: string; // 'all' | profile id
  unidade: string; // 'all' | norte | sul | shopping | pap
};

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function mesesRecentes(qtd = 12) {
  const out: { value: string; label: string }[] = [];
  const hoje = new Date();
  for (let i = 0; i < qtd; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({
      value,
      label: d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    });
  }
  return out;
}

export function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Retorna todos os descendentes (equipe direta + equipes de gerentes subordinados). */
export function descendentesDe(todos: Membro[], uid: string) {
  const filhosPorGerente = new Map<string, Membro[]>();
  for (const m of todos) {
    if (!m.gerente_id) continue;
    const arr = filhosPorGerente.get(m.gerente_id) ?? [];
    arr.push(m);
    filhosPorGerente.set(m.gerente_id, arr);
  }
  const out: Membro[] = [];
  const visitados = new Set<string>([uid]);
  const fila = [uid];
  while (fila.length) {
    const atual = fila.shift()!;
    for (const f of filhosPorGerente.get(atual) ?? []) {
      if (visitados.has(f.id)) continue;
      visitados.add(f.id);
      out.push(f);
      fila.push(f.id);
    }
  }
  return out;
}

/** Carrega o time visível para o gestor logado. */
export function useEquipe(uid?: string, role?: string) {
  return useQuery({
    queryKey: ["equipe-dashboard", uid, role],
    enabled: !!uid && !!role,
    staleTime: 60_000,
    queryFn: async (): Promise<Membro[]> => {
      const [{ data: profs }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, nome, canal, loja_unidade, gerente_id, ativo"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const roleMap = new Map<string, Membro["role"]>();
      for (const r of roles ?? []) roleMap.set(r.user_id, r.role as Membro["role"]);

      const todos: Membro[] = (profs ?? []).map((p) => ({
        id: p.id,
        nome: p.nome || "—",
        canal: (p.canal ?? "loja") as Membro["canal"],
        loja_unidade: (p.loja_unidade ?? null) as Membro["loja_unidade"],
        gerente_id: p.gerente_id ?? null,
        role: roleMap.get(p.id) ?? "consultor",
      }));

      if (role === "gerente" || role === "lider_pap") {
        // toda a cadeia abaixo do gerente (consultores + gerentes subordinados e seus times)
        return descendentesDe(todos, uid!);
      }
      // regional / admin
      return todos.filter((m) => m.id !== uid);
    },
  });
}

export function aplicarFiltros(membros: Membro[], f: Filtros, role: string) {
  let list = membros;
  if (f.unidade !== "all") {
    list =
      f.unidade === "pap"
        ? list.filter((m) => m.canal === "pap")
        : list.filter((m) => m.loja_unidade === f.unidade);
  }
  if (f.pessoa !== "all") {
    // pessoa = gestor selecionado → ele + toda a sua cadeia
    const cadeia = new Set([f.pessoa, ...descendentesDe(membros, f.pessoa).map((m) => m.id)]);
    list = list.filter((m) => cadeia.has(m.id));
  }
  return list;
}


export function FiltrosBar({
  role,
  membros,
  filtros,
  onChange,
}: {
  role: string;
  membros: Membro[];
  filtros: Filtros;
  onChange: (f: Filtros) => void;
}) {
  const gerentes = useMemo(
    () => membros.filter((m) => (m.role === "gerente" || m.role === "lider_pap")).sort((a, b) => a.nome.localeCompare(b.nome)),
    [membros],
  );
  const consultores = useMemo(
    () => membros.filter((m) => m.role === "consultor").sort((a, b) => a.nome.localeCompare(b.nome)),
    [membros],
  );
  const isRegional = role !== "gerente" && role !== "lider_pap";
  // Gerente que tem gerentes na equipe pode filtrar por esses gerentes também
  const pessoas = useMemo(
    () => (isRegional ? gerentes : [...gerentes, ...consultores]),
    [isRegional, gerentes, consultores],
  );
  const labelPessoa = isRegional ? "Gerente" : gerentes.length ? "Gerente / Consultor" : "Consultor";

  return (
    <Card>
      <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">{labelPessoa}</Label>
          <Select value={filtros.pessoa} onValueChange={(v) => onChange({ ...filtros, pessoa: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {pessoas.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Loja / Canal</Label>
          <Select value={filtros.unidade} onValueChange={(v) => onChange({ ...filtros, unidade: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="norte">Loja Norte</SelectItem>
              <SelectItem value="sul">Loja Sul</SelectItem>
              <SelectItem value="shopping">Loja Shopping</SelectItem>
              <SelectItem value="pap">PAP</SelectItem>
            </SelectContent>
          </Select>
        </div>


        <div className="space-y-1.5">
          <Label className="text-xs">Mês</Label>
          <Select value={filtros.mes} onValueChange={(v) => onChange({ ...filtros, mes: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {mesesRecentes().map((m) => (
                <SelectItem key={m.value} value={m.value} className="capitalize">
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

type Linha = {
  id: string;
  nome: string;
  fibraQtd: number;
  movelQtd: number;
  renovacoesRs: number;
  leads: number;
};

export function RankingEquipe({
  role,
  membros,
  filtros,
}: {
  role: string;
  membros: Membro[];
  filtros: Filtros;
}) {
  const isRegional = role !== "gerente" && role !== "lider_pap";
  const escopo = useMemo(() => aplicarFiltros(membros, filtros, role), [membros, filtros, role]);
  const ids = useMemo(() => escopo.map((m) => m.id), [escopo]);
  const mesRef = `${filtros.mes}-01`;

  const { data, isLoading } = useQuery({
    queryKey: ["ranking-equipe", role, isRegional, mesRef, ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Linha[]> => {
      const inicio = `${mesRef}T00:00:00`;
      const fimDate = new Date(
        Number(filtros.mes.slice(0, 4)),
        Number(filtros.mes.slice(5, 7)),
        1,
      );
      const fim = `${fimDate.getFullYear()}-${String(fimDate.getMonth() + 1).padStart(2, "0")}-01T00:00:00`;
      const ehMesAtual = filtros.mes === mesAtual();

      const lojaQ = supabase
        .from("vendas_loja")
        .select("vendedor_id, tecnologia, contem_movel, classe_protocolo, qtd_linhas, valor_novo, valor_antigo")
        .in("vendedor_id", ids);
      const papQ = supabase
        .from("vendas_pap")
        .select("vendedor_id, tecnologia, produto, tipo_protocolo, qtd_linhas, valor, valor_novo, valor_antigo")
        .in("vendedor_id", ids);
      if (ehMesAtual) {
        lojaQ.is("arquivada_em", null);
        papQ.is("arquivada_em", null);
      } else {
        lojaQ.eq("mes_ref", mesRef);
        papQ.eq("mes_ref", mesRef);
      }

      const [loja, pap, leads] = await Promise.all([
        lojaQ,
        papQ,
        supabase
          .from("leads")
          .select("vendedor_id, created_at")
          .gte("created_at", inicio)
          .lt("created_at", fim)
          .in("vendedor_id", ids),
      ]);

      // agrupamento: sobe a hierarquia até o topo visível dentro do escopo
      const membroPorId = new Map(escopo.map((m) => [m.id, m]));
      const chaveDe = (userId: string) => {
        let m = membroPorId.get(userId);
        if (!m) return null;
        // Gerente/Líder: ranking individual apenas de consultores (sem acumular nos líderes)
        if (!isRegional) return m.role === "consultor" ? m.id : null;
        const visto = new Set<string>();
        while (m.gerente_id && membroPorId.has(m.gerente_id) && !visto.has(m.id)) {
          visto.add(m.id);
          m = membroPorId.get(m.gerente_id)!;
        }
        return m.id;
      };
      const nomes = new Map<string, string>();
      for (const m of escopo) nomes.set(m.id, m.nome);
      nomes.set("sem-gerente", "Sem gerente");


      const linhas = new Map<string, Linha>();
      const get = (k: string) => {
        let l = linhas.get(k);
        if (!l) {
          l = { id: k, nome: nomes.get(k) ?? "—", fibraQtd: 0, movelQtd: 0, renovacoesRs: 0, leads: 0 };
          linhas.set(k, l);
        }
        return l;
      };

      // mesmos critérios da dashboard do consultor
      const isBL = (t?: string | null) =>
        !!t && (/banda\s*larga/i.test(t) || /fibra|fttx|internet/i.test(t));
      const isMovel = (t?: string | null) => !!t && /m[óo]vel|movel|celular|5g|4g/i.test(t);

      for (const v of loja.data ?? []) {
        const k = chaveDe(v.vendedor_id);
        if (!k) continue;
        const l = get(k);
        const novo = Number(v.valor_novo ?? 0);
        const antigo = Number(v.valor_antigo ?? 0);
        const val = antigo > 0 ? novo - antigo : novo;
        const qtdLinhas = Number(v.qtd_linhas ?? 0);
        const renov = (v.classe_protocolo ?? "").startsWith("Renovação");
        if (isBL(v.tecnologia) && !renov) l.fibraQtd++;
        if (isMovel(v.tecnologia) || v.contem_movel || qtdLinhas > 0) l.movelQtd += qtdLinhas;
        if (renov) l.renovacoesRs += val;
      }
      for (const v of pap.data ?? []) {
        const k = chaveDe(v.vendedor_id);
        if (!k) continue;
        const l = get(k);
        const novo = Number(v.valor_novo ?? 0) || Number(v.valor ?? 0);
        const antigo = Number(v.valor_antigo ?? 0);
        const val = antigo > 0 ? novo - antigo : novo;
        const desc = `${v.produto ?? ""} ${v.tecnologia ?? ""}`;
        const qtdLinhas = Number(v.qtd_linhas ?? 0);
        const renov = (v.tipo_protocolo ?? "").startsWith("Renovação");
        if (isBL(desc) && !renov) l.fibraQtd++;
        if (isMovel(desc) || qtdLinhas > 0) l.movelQtd += qtdLinhas;
        if (renov) l.renovacoesRs += val;
      }

      for (const ld of leads.data ?? []) {
        const k = chaveDe(ld.vendedor_id);
        if (!k) continue;
        get(k).leads++;
      }

      // garante que todos os "topos" apareçam mesmo zerados
      for (const m of escopo) {
        const k = chaveDe(m.id);
        if (k && k === m.id) get(k).nome = m.nome;
      }


      return [...linhas.values()];
    },
  });

  const linhas = data ?? [];

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Ranking por indicador — {isRegional ? "Gerentes" : "Consultores"}
      </h2>
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum dado no período/filtro selecionado.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <RankCard titulo="Fibra (Qtd)" linhas={linhas} valorDe={(l) => l.fibraQtd} />
          <RankCard titulo="Móvel (Qtd)" linhas={linhas} valorDe={(l) => l.movelQtd} />
          <RankCard
            titulo="Renovações (R$)"
            linhas={linhas}
            valorDe={(l) => l.renovacoesRs}
            format={brl}
          />
          <RankCard titulo="Leads cadastrados" linhas={linhas} valorDe={(l) => l.leads} />
        </div>
      )}
    </div>
  );
}

function RankCard({
  titulo,
  linhas,
  valorDe,
  format,
}: {
  titulo: string;
  linhas: Linha[];
  valorDe: (l: Linha) => number;
  format?: (n: number) => string;
}) {
  const ordenado = [...linhas].sort((a, b) => valorDe(b) - valorDe(a));
  const max = Math.max(1, valorDe(ordenado[0] ?? ({} as Linha)) || 1);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {ordenado.map((l, i) => (
          <div key={l.id} className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-5 text-xs font-bold text-muted-foreground">{i + 1}º</span>
              <span className="truncate">{l.nome}</span>
              <span className="ml-auto font-semibold">
                {format ? format(valorDe(l)) : valorDe(l)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round((valorDe(l) / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
