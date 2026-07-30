import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, Sparkles, CheckCircle2, X, History, Info } from "lucide-react";
import { analisarCircular, aplicarRegras, type PropostaRegras } from "@/lib/regras.functions";
import { brl } from "@/lib/comissao";

export const Route = createFileRoute("/_authenticated/regras-comissionamento")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getUser();
    const uid = sess.user?.id;
    if (!uid) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    const isGestor = (roles ?? []).some(
      (r) => r.role === "gerente" || r.role === "regional" || r.role === "admin",
    );
    if (!isGestor) throw redirect({ to: "/dashboard" });
  },
  component: RegrasPage,
  head: () => ({
    meta: [
      { title: "Regras de Comissionamento | Unifique" },
      {
        name: "description",
        content:
          "Envie PDFs, fotos e textos das circulares: a IA interpreta e atualiza as regras válidas para as próximas vendas.",
      },
      { property: "og:title", content: "Regras de Comissionamento | Unifique" },
      {
        property: "og:description",
        content: "Atualize as regras de comissão a partir de PDFs, fotos e textos interpretados por IA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function RegrasPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Regras de Comissionamento</h1>
        <p className="text-sm text-muted-foreground">
          Anexe PDFs, fotos/prints de tabelas e/ou digite as regras em texto. A IA lê todas as fontes
          juntas e propõe a atualização — você revisa antes de aplicar.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          As regras aplicadas passam a valer <b>somente para novas vendas</b>. As vendas já
          registradas mantêm a comissão calculada pelas regras vigentes na data do registro.
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <CircularCard tipo="loja" titulo="Regras Loja" />
        <CircularCard tipo="pap" titulo="Regras PAP" />
      </div>

      <HistoricoVersoes />
    </div>
  );
}

const ACCEPT = "application/pdf,image/*,text/plain,text/csv,.md";

async function toBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function CircularCard({ tipo, titulo }: { tipo: "loja" | "pap"; titulo: string }) {
  const analisar = useServerFn(analisarCircular);
  const aplicar = useServerFn(aplicarRegras);
  const [files, setFiles] = useState<File[]>([]);
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [proposta, setProposta] = useState<PropostaRegras | null>(null);

  const fontes = [
    ...files.map((f) => f.name),
    ...(texto.trim() ? ["texto digitado"] : []),
  ].join(", ");

  async function handleAnalisar() {
    if (!files.length && !texto.trim()) return;
    setLoading(true);
    setProposta(null);
    try {
      const anexos = await Promise.all(
        files.map(async (f) => ({
          filename: f.name,
          mime: f.type || "application/octet-stream",
          base64: await toBase64(f),
        })),
      );
      const res = await analisar({ data: { tipo, anexos, texto } });
      setProposta(res);
      toast.success("Fontes interpretadas com sucesso. Revise antes de aplicar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao analisar as regras.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAplicar() {
    if (!proposta) return;
    setApplying(true);
    try {
      const r = await aplicar({ data: { proposta, fontes } });
      toast.success(`${r.atualizadas} regra(s) em vigor para novas vendas.`);
      setProposta(null);
      setFiles([]);
      setTexto("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao aplicar regras.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-4 w-4" /> {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Anexos (PDF, fotos/prints, txt) — pode selecionar vários
          </label>
          <Input
            type="file"
            multiple
            accept={ACCEPT}
            onChange={(e) => {
              const novos = Array.from(e.target.files ?? []);
              if (novos.length) setFiles((prev) => [...prev, ...novos].slice(0, 8));
              e.target.value = "";
              setProposta(null);
            }}
          />
          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-xs"
                >
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    aria-label={`Remover ${f.name}`}
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="ml-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Regras em texto (opcional)
          </label>
          <Textarea
            rows={4}
            maxLength={20000}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setProposta(null);
            }}
            placeholder="Cole aqui trechos da circular, complementos ou exceções que a IA deve considerar…"
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleAnalisar}
            disabled={(!files.length && !texto.trim()) || loading}
            className="w-full"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Analisar com IA
          </Button>
        </div>


        {proposta && (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <p className="text-sm">{proposta.resumo}</p>
            {proposta.tipo === "loja" ? (
              <>
                <PreviewTable
                  title="Faixas por diferença de ticket"
                  headers={["Diff de", "Diff até", "Faixa 0", "Faixa 1", "Faixa 2", "Faixa 3"]}
                  rows={(proposta.faixas_loja ?? []).map((f) => [
                    brl(f.diff_de),
                    brl(f.diff_ate),
                    brl(f.faixa_0),
                    brl(f.faixa_1),
                    brl(f.faixa_2),
                    brl(f.faixa_3),
                  ])}
                />
                <PreviewTable
                  title="Metas de faixa efetiva"
                  headers={["Faixa", "Meta receita", "Meta renov. móvel"]}
                  rows={(proposta.metas_loja ?? []).map((m) => [
                    String(m.faixa),
                    brl(m.meta_receita),
                    `${(m.meta_renov_movel * 100).toFixed(0)}%`,
                  ])}
                />
              </>
            ) : (
              <PreviewTable
                title="Faixas PAP"
                headers={["Faixa", "Receita de", "Até", "% Comissão", "Máx. Cancel", "Acel.", "Bônus indireta"]}
                rows={(proposta.faixas_pap ?? []).map((f) => [
                  String(f.faixa),
                  brl(f.receita_de),
                  brl(f.receita_ate),
                  `${(f.pct_comissao * 100).toFixed(2)}%`,
                  `${(f.meta_max_cancel * 100).toFixed(2)}%`,
                  `${(f.acelerador_baixo_cancel * 100).toFixed(2)}%`,
                  brl(f.bonus_venda_indireta),
                ])}
              />
            )}
            <Button onClick={handleAplicar} disabled={applying} variant="default" className="w-full">
              {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Aplicar regras {tipo === "loja" ? "Loja" : "PAP"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PreviewTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                {r.map((c, j) => (
                  <td key={j} className="px-2 py-1">{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
