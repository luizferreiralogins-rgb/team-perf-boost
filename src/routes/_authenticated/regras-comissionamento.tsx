import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, Sparkles, CheckCircle2 } from "lucide-react";
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
      { name: "description", content: "Analise circulares de comissionamento com IA e atualize parâmetros." },
    ],
  }),
});

function RegrasPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Regras de Comissionamento</h1>
        <p className="text-sm text-muted-foreground">
          Envie a circular em PDF. A IA interpreta o documento e propõe a atualização das faixas —
          você revisa antes de aplicar.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <CircularCard tipo="loja" titulo="Circular Loja" />
        <CircularCard tipo="pap" titulo="Circular PAP" />
      </div>
    </div>
  );
}

function CircularCard({ tipo, titulo }: { tipo: "loja" | "pap"; titulo: string }) {
  const analisar = useServerFn(analisarCircular);
  const aplicar = useServerFn(aplicarRegras);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [proposta, setProposta] = useState<PropostaRegras | null>(null);

  async function handleAnalisar() {
    if (!file) return;
    setLoading(true);
    setProposta(null);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin);
      const res = await analisar({ data: { tipo, pdfBase64: b64, filename: file.name } });
      setProposta(res);
      toast.success("Circular interpretada com sucesso. Revise antes de aplicar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao analisar circular.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAplicar() {
    if (!proposta) return;
    setApplying(true);
    try {
      const r = await aplicar({ data: { proposta } });
      toast.success(`${r.atualizadas} regra(s) atualizada(s).`);
      setProposta(null);
      setFile(null);
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
        <Input
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setProposta(null);
          }}
        />
        <div className="flex gap-2">
          <Button onClick={handleAnalisar} disabled={!file || loading} className="w-full">
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
