// Importação da planilha "Análise Sistemática": lê o Excel no navegador,
// pede à IA para identificar cada bloco de indicadores e grava os valores
// nos meses correspondentes de cada cidade.
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";
import { mapearBlocosEstrategicos } from "@/lib/estrategico.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

function mesDoTexto(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const t = semAcento(v).slice(0, 3);
  const i = MESES_ABREV.indexOf(t);
  return i >= 0 ? i + 1 : null;
}

function paraNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.replace(/[R$\s%]/g, "").replace(/\./g, "").replace(",", ".");
  if (!t || Number.isNaN(Number(t))) return null;
  const n = Number(t);
  return v.includes("%") ? n / 100 : n;
}

type Bloco = {
  id: number;
  aba: string;
  titulo: string;
  colunas: { mes: number; col: number }[];
  extras: Record<string, number>;
};
type LinhaCidade = { cidade: string; unidade: string; regional: string; celulas: unknown[] };

/** Interpreta a estrutura de uma aba: blocos de indicadores x meses x cidades. */
function lerAba(nome: string, matriz: unknown[][], proximoId: () => number) {
  const idxHeader = matriz.findIndex((r) =>
    r?.some((c) => typeof c === "string" && semAcento(c) === "cidade"),
  );
  if (idxHeader < 0) return null;

  const header = matriz[idxHeader] ?? [];
  const acharCol = (nomeCol: string) =>
    header.findIndex((c) => typeof c === "string" && semAcento(c) === nomeCol);
  const colCidade = acharCol("cidade");
  const colUnidade = acharCol("unidade");
  const colRegional = acharCol("regional");

  // Títulos dos blocos ficam nas linhas acima do cabeçalho (células mescladas).
  const titulos: (string | null)[] = [];
  for (let c = 0; c < header.length; c++) {
    let t: string | null = null;
    for (let r = 0; r < idxHeader; r++) {
      const v = matriz[r]?.[c];
      if (typeof v === "string" && v.trim()) t = v.trim();
    }
    titulos[c] = t;
  }

  const blocos: Bloco[] = [];
  let atual: Bloco | null = null;
  for (let c = 0; c < header.length; c++) {
    if (titulos[c]) {
      atual = { id: proximoId(), aba: nome, titulo: titulos[c] as string, colunas: [], extras: {} };
      blocos.push(atual);
    }
    const mes = mesDoTexto(header[c]);
    if (mes && atual) atual.colunas.push({ mes, col: c });
    // Colunas fixas (sem mês) do bloco de portas: Total / Ocupadas / Livres.
    if (!mes && atual && typeof header[c] === "string") {
      const rot = semAcento(header[c] as string);
      if (rot === "total" || rot === "ocupadas" || rot === "livres") atual.extras[rot] = c;
    }
  }

  // Blocos com mais de 12 meses começam no mês anterior (Dez do ano passado).
  for (const b of blocos) if (b.colunas.length > 12) b.colunas = b.colunas.slice(b.colunas.length - 12);

  const linhas: LinhaCidade[] = [];
  for (let r = idxHeader + 1; r < matriz.length; r++) {
    const linha = matriz[r] ?? [];
    const cidade = colCidade >= 0 ? linha[colCidade] : null;
    if (typeof cidade !== "string" || !cidade.trim()) continue;
    linhas.push({
      cidade: cidade.trim(),
      unidade: typeof linha[colUnidade] === "string" ? (linha[colUnidade] as string).trim() : "",
      regional: typeof linha[colRegional] === "string" ? (linha[colRegional] as string).trim() : "",
      celulas: linha,
    });
  }

  return { blocos: blocos.filter((b) => b.colunas.length || b.extras.ocupadas !== undefined), linhas };
}

export function ImportarEstrategico({ ano, onPronto }: { ano: number; onPronto: () => void }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [resumo, setResumo] = useState<string | null>(null);

  const importar = useMutation({
    mutationFn: async (file: File) => {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: false });

      let seq = 0;
      const proximoId = () => ++seq;
      const abas = wb.SheetNames.map((nome) => {
        const ws = wb.Sheets[nome];
        const ref = ws?.["!ref"];
        if (!ref) return null;
        // Limita a leitura às primeiras linhas: abas do Excel podem declarar milhões de linhas vazias.
        const rng = XLSX.utils.decode_range(ref);
        rng.e.r = Math.min(rng.e.r, rng.s.r + 500);
        const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, {
          header: 1,
          defval: null,
          blankrows: true,
          range: rng,
        });
        const lido = lerAba(nome, matriz, proximoId);
        return lido && lido.blocos.length && lido.linhas.length ? { nome, ...lido } : null;

      }).filter(Boolean) as Array<{ nome: string; blocos: Bloco[]; linhas: LinhaCidade[] }>;

      if (!abas.length) throw new Error("Nenhuma aba com coluna “Cidade” e meses foi encontrada.");

      const todos = abas.flatMap((a) => a.blocos);
      const { mapa } = await mapearBlocosEstrategicos({
        data: { blocos: todos.map((b) => ({ id: b.id, aba: b.aba, titulo: b.titulo })) },
      });
      const campoPorBloco = new Map(mapa.map((m) => [m.id, m.campo]));
      if (![...campoPorBloco.values()].some((c) => c && c !== "ignorar"))
        throw new Error("A IA não reconheceu nenhum indicador conhecido na planilha.");

      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) throw new Error("Sessão expirada. Entre novamente.");

      const { data: existentes, error: errCid } = await supabase
        .from("estrategico_cidades")
        .select("id, cidade, unidade, regional")
        .eq("ano", ano);
      if (errCid) throw errCid;

      const porNome = new Map(
        (existentes ?? []).map((c) => [semAcento(c.cidade), c as { id: string; cidade: string }]),
      );

      // Cria as cidades da planilha que ainda não existem no ano selecionado.
      const novas = new Map<string, LinhaCidade>();
      for (const aba of abas)
        for (const l of aba.linhas)
          if (!porNome.has(semAcento(l.cidade)) && !novas.has(semAcento(l.cidade)))
            novas.set(semAcento(l.cidade), l);

      if (novas.size) {
        const { data: criadas, error } = await supabase
          .from("estrategico_cidades")
          .insert(
            [...novas.values()].map((l) => ({
              cidade: l.cidade,
              unidade: l.unidade,
              regional: l.regional,
              ano,
              owner_id: uid,
            })),
          )
          .select("id, cidade");
        if (error) throw error;
        for (const c of criadas ?? []) porNome.set(semAcento(c.cidade), c);
      }

      // Monta os valores por cidade e mês; o bloco de portas atualiza a cidade (não é mensal).
      const valores = new Map<string, Record<string, number>>();
      const portasPorCidade = new Map<string, { portas_total?: number; portas_ocupadas?: number }>();
      for (const aba of abas) {
        for (const bloco of aba.blocos) {
          const campo = campoPorBloco.get(bloco.id);
          if (!campo || campo === "ignorar") continue;
          if (campo === "portas_ocupadas") {
            for (const l of aba.linhas) {
              const cid = porNome.get(semAcento(l.cidade))?.id;
              if (!cid) continue;
              const total = bloco.extras.total !== undefined ? paraNumero(l.celulas[bloco.extras.total]) : null;
              const ocupadas = bloco.extras.ocupadas !== undefined ? paraNumero(l.celulas[bloco.extras.ocupadas]) : null;
              const p = portasPorCidade.get(cid) ?? {};
              if (total !== null) p.portas_total = total;
              if (ocupadas !== null) p.portas_ocupadas = ocupadas;
              portasPorCidade.set(cid, p);
            }
            continue;
          }
          for (const l of aba.linhas) {
            const cid = porNome.get(semAcento(l.cidade))?.id;
            if (!cid) continue;
            for (const { mes, col } of bloco.colunas) {
              const n = paraNumero(l.celulas[col]);
              if (n === null) continue;
              const chave = `${cid}|${mes}`;
              const atual = valores.get(chave) ?? {};
              atual[campo] = n;
              valores.set(chave, atual);
            }
          }
        }
      }

      for (const [cid, p] of portasPorCidade) {
        const { error } = await supabase.from("estrategico_cidades").update(p as never).eq("id", cid);
        if (error) throw error;
      }

      if (!valores.size && !portasPorCidade.size) throw new Error("Nenhum valor numérico foi encontrado na planilha.");

      const ids = [...porNome.values()].map((c) => c.id);
      const { data: mensais, error: errMensal } = await supabase
        .from("estrategico_mensal")
        .select("id, cidade_id, mes")
        .in("cidade_id", ids);
      if (errMensal) throw errMensal;
      const existenteMensal = new Map(
        (mensais ?? []).map((m) => [`${m.cidade_id}|${m.mes}`, m.id]),
      );

      const inserir: Record<string, unknown>[] = [];
      let atualizados = 0;
      for (const [chave, campos] of valores) {
        const [cidade_id, mes] = chave.split("|");
        const id = existenteMensal.get(chave);
        if (id) {
          const { error } = await supabase
            .from("estrategico_mensal")
            .update(campos as never)
            .eq("id", id);
          if (error) throw error;
          atualizados++;
        } else {
          inserir.push({ cidade_id, mes: Number(mes), ...campos });
        }
      }

      for (let i = 0; i < inserir.length; i += 200) {
        const { error } = await supabase
          .from("estrategico_mensal")
          .insert(inserir.slice(i, i + 200) as never);
        if (error) throw error;
      }

      const indicadores = new Set(
        [...campoPorBloco.values()].filter((c) => c && c !== "ignorar"),
      );
      return {
        cidades: porNome.size,
        novas: novas.size,
        registros: atualizados + inserir.length,
        indicadores: indicadores.size,
      };
    },
    onSuccess: (r) => {
      setResumo(
        `${r.registros} registros atualizados em ${r.cidades} cidades (${r.novas} novas) · ${r.indicadores} indicadores reconhecidos.`,
      );
      toast.success("Planilha importada com sucesso");
      qc.invalidateQueries({ queryKey: ["estrategico", ano] });
      onPronto();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Atualizar dados por planilha</CardTitle>
        <CardDescription>
          Anexe o Excel da Análise Sistemática. A IA identifica os indicadores de Banda Larga e
          Móvel e atualiza cada cidade no mês correspondente de {ano}.
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
            if (f) {
              setResumo(null);
              importar.mutate(f);
            }
          }}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={importar.isPending}>
          {importar.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {importar.isPending ? "Analisando planilha…" : "Anexar planilha Excel"}
        </Button>
        {resumo && <p className="text-sm text-muted-foreground">{resumo}</p>}
      </CardContent>
    </Card>
  );
}
