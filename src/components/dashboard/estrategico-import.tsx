// Importação da planilha padrão "Análises Sistemáticas": cada aba (ex.: "Banda Larga 2025",
// "Banda Larga 2026", "Móvel 2026") traz o ano no nome e os blocos de indicadores em ordem fixa.
// Os dados são compartilhados: qualquer gestor que anexa atualiza para todos os perfis.
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

function paraNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.replace(/[R$\s%]/g, "").replace(/\./g, "").replace(",", ".");
  if (!t || Number.isNaN(Number(t))) return null;
  const n = Number(t);
  return v.includes("%") ? n / 100 : n;
}

type Campo = string | null;
// Ordem dos blocos mensais na planilha padrão (null = bloco calculado/ignorado).
const BL_2026: Campo[] = [
  "vendas", "meta_vendas", null, "quebra_venda", "vendas_brutas", "ativacoes", "meta_ativacoes", null,
  "acessos_anatel", "cancel_voluntario", "cancel_involuntario", null, null, "churn_geral",
  "ativacoes_liquidas", "net_ads", "market_share",
];
const BL_SEM_QUEBRA: Campo[] = [
  "vendas", "meta_vendas", null, "ativacoes", "meta_ativacoes", null, "acessos_anatel",
  "cancel_voluntario", "cancel_involuntario", null, null, "churn_geral", "ativacoes_liquidas",
  "net_ads", "market_share",
];
const MOVEL: Campo[] = [
  "mv_linhas_vendidas", "mv_meta_vendidas", null, "mv_linhas_ativadas", "mv_meta_ativadas", null,
  null, null, "mv_acessos_anatel", null, "mv_cancel_voluntario", "mv_cancel_involuntario", null, null,
  "mv_churn_geral", "mv_ativacoes_liquidas", "mv_net_ads", "mv_market_share",
];

type Linha = {
  cidade: string; unidade: string; regional: string; ranking: string | null;
  total: number | null; ocupadas: number | null; celulas: unknown[];
};
type Aba = { nome: string; ano: number; movel: boolean; blocos: { campo: string; cols: number[] }[]; linhas: Linha[] };

function lerAba(nome: string, m: unknown[][]): Aba | string | null {
  const anoM = nome.match(/(20\d{2})/);
  if (!anoM) return null;
  const ano = Number(anoM[1]);
  const movel = semAcento(nome).includes("movel");
  const hi = m.findIndex((r) => r?.some((c) => typeof c === "string" && semAcento(c) === "cidade"));
  if (hi < 0) return null;
  const h = (m[hi] ?? []).map((c) => (typeof c === "string" ? semAcento(c) : ""));
  const col = (f: (s: string) => boolean) => h.findIndex(f);
  const cCid = col((s) => s === "cidade");
  const cUni = col((s) => s === "unidade");
  const cReg = col((s) => s === "regional");
  const cRank = col((s) => s.startsWith("ranking"));
  const cTot = col((s) => s === "total");
  const cOcu = col((s) => s === "ocupadas");

  // Segmenta blocos de meses: começam em "Jan" ou em "Dez" seguido de "Jan" (Dez do ano anterior).
  const mes = h.map((s) => MESES.indexOf(s.slice(0, 3)));
  const blocos: number[][] = [];
  let cur: number[] | null = null;
  for (let j = 0; j < h.length; j++) {
    if (mes[j] < 0) { cur = null; continue; }
    const cheio = cur && cur.length >= (mes[cur[0]] === 11 ? 13 : 12);
    if ((!cur || cheio) && (mes[j] === 0 || (mes[j] === 11 && mes[j + 1] === 0))) {
      cur = [];
      blocos.push(cur);
    }
    cur?.push(j);
  }
  const tpl = movel ? MOVEL : blocos.length >= BL_2026.length ? BL_2026 : BL_SEM_QUEBRA;
  if (blocos.length < tpl.length)
    return `A aba "${nome}" tem ${blocos.length} blocos de meses; o modelo padrão espera ${tpl.length}.`;

  const linhas: Linha[] = [];
  for (let r = hi + 1; r < m.length; r++) {
    const l = m[r] ?? [];
    const cidade = l[cCid];
    if (typeof cidade !== "string" || !cidade.trim()) continue;
    const rk = cRank >= 0 ? l[cRank] : null;
    linhas.push({
      cidade: cidade.trim(),
      unidade: typeof l[cUni] === "string" ? (l[cUni] as string).trim() : "",
      regional: typeof l[cReg] === "string" ? (l[cReg] as string).trim() : "",
      ranking: rk === null || rk === undefined || rk === "" ? null : String(rk).replace(/º/g, "").trim() + "º",
      total: cTot >= 0 ? paraNumero(l[cTot]) : null,
      ocupadas: cOcu >= 0 ? paraNumero(l[cOcu]) : null,
      celulas: l,
    });
  }
  return {
    nome, ano, movel, linhas,
    blocos: tpl.flatMap((campo, i) => (campo ? [{ campo, cols: blocos[i].slice(-12) }] : [])),
  };
}

export function ImportarEstrategico({ onPronto }: { ano?: number; onPronto: () => void }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [resumo, setResumo] = useState<string | null>(null);

  const importar = useMutation({
    mutationFn: async (file: File) => {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: false });
      const abas: Aba[] = [];
      for (const nome of wb.SheetNames) {
        const ws = wb.Sheets[nome];
        if (!ws?.["!ref"]) continue;
        const rng = XLSX.utils.decode_range(ws["!ref"]);
        rng.e.r = Math.min(rng.e.r, rng.s.r + 500);
        const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: true, range: rng });
        const lido = lerAba(nome, matriz);
        if (typeof lido === "string") throw new Error(lido);
        if (lido && lido.linhas.length) abas.push(lido);
      }
      if (!abas.length) throw new Error("Nenhuma aba no padrão (ex.: “Banda Larga 2026”, com coluna Cidade) foi encontrada.");

      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) throw new Error("Sessão expirada. Entre novamente.");

      let registros = 0, novasTot = 0;
      const anos = [...new Set(abas.map((a) => a.ano))];
      for (const ano of anos) {
        const doAno = abas.filter((a) => a.ano === ano);
        const { data: existentes, error } = await supabase
          .from("estrategico_cidades").select("id, cidade").eq("ano", ano);
        if (error) throw error;
        const porNome = new Map((existentes ?? []).map((c) => [semAcento(c.cidade), c.id]));

        const novas = new Map<string, Linha>();
        for (const a of doAno) for (const l of a.linhas)
          if (!porNome.has(semAcento(l.cidade)) && !novas.has(semAcento(l.cidade))) novas.set(semAcento(l.cidade), l);
        if (novas.size) {
          const { data: criadas, error: e } = await supabase.from("estrategico_cidades")
            .insert([...novas.values()].map((l) => ({ cidade: l.cidade, unidade: l.unidade, regional: l.regional, ano, owner_id: uid })))
            .select("id, cidade");
          if (e) throw e;
          for (const c of criadas ?? []) porNome.set(semAcento(c.cidade), c.id);
          novasTot += novas.size;
        }

        // Dados da cidade: portas e ranking Anatel (BL) / ranking móvel.
        const dadosCidade = new Map<string, Record<string, unknown>>();
        const valores = new Map<string, Record<string, number>>();
        for (const a of doAno) for (const l of a.linhas) {
          const cid = porNome.get(semAcento(l.cidade));
          if (!cid) continue;
          const d = dadosCidade.get(cid) ?? {};
          if (a.movel) d.ranking_anatel_movel = l.ranking;
          else {
            d.ranking_anatel = l.ranking;
            if (l.total !== null) d.portas_total = l.total;
            if (l.ocupadas !== null) d.portas_ocupadas = l.ocupadas;
          }
          dadosCidade.set(cid, d);
          for (const b of a.blocos) b.cols.forEach((c, i) => {
            const n = paraNumero(l.celulas[c]);
            if (n === null) return;
            const k = `${cid}|${i + 1}`;
            const v = valores.get(k) ?? {};
            v[b.campo] = n;
            valores.set(k, v);
          });
        }
        for (const [cid, d] of dadosCidade) {
          const { error: e } = await supabase.from("estrategico_cidades").update(d as never).eq("id", cid);
          if (e) throw e;
        }

        const { data: mensais, error: em } = await supabase.from("estrategico_mensal")
          .select("id, cidade_id, mes").in("cidade_id", [...porNome.values()]);
        if (em) throw em;
        const exist = new Map((mensais ?? []).map((x) => [`${x.cidade_id}|${x.mes}`, x.id]));
        const inserir: Record<string, unknown>[] = [];
        for (const [k, campos] of valores) {
          const id = exist.get(k);
          if (id) {
            const { error: e } = await supabase.from("estrategico_mensal").update(campos as never).eq("id", id);
            if (e) throw e;
          } else {
            const [cidade_id, mes] = k.split("|");
            inserir.push({ cidade_id, mes: Number(mes), ...campos });
          }
          registros++;
        }
        for (let i = 0; i < inserir.length; i += 200) {
          const { error: e } = await supabase.from("estrategico_mensal").insert(inserir.slice(i, i + 200) as never);
          if (e) throw e;
        }
      }
      return { abas: abas.map((a) => a.nome), anos, registros, novas: novasTot };
    },
    onSuccess: (r) => {
      setResumo(`Abas lidas: ${r.abas.join(", ")} · ${r.registros} meses atualizados · ${r.novas} cidades novas.`);
      toast.success("Planilha importada para todos os perfis");
      for (const a of r.anos) qc.invalidateQueries({ queryKey: ["estrategico", a] });
      onPronto();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Atualizar dados por planilha</CardTitle>
        <CardDescription>
          Anexe a planilha padrão de Análises Sistemáticas (abas Banda Larga e Móvel com o ano no nome).
          Cada aba atualiza o ano correspondente, incluindo portas e Ranking Anatel, para todos os perfis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.xlsm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) { setResumo(null); importar.mutate(f); }
          }}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={importar.isPending}>
          {importar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {importar.isPending ? "Importando planilha…" : "Anexar planilha Excel"}
        </Button>
        {resumo && <p className="text-sm text-muted-foreground">{resumo}</p>}
      </CardContent>
    </Card>
  );
}
