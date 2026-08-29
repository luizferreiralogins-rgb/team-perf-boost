import { Download, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import diretrizLoja from "@/assets/diretriz-loja.pdf.asset.json";
import diretrizPap from "@/assets/diretriz-pap.pdf.asset.json";

const DOCS = [
  {
    codigo: "PV-MER-020",
    titulo: "Plano de Vendas para Canais Presencial Receptivo (Loja)",
    versao: "Versão 005 — aprovada em 01/07/2026",
    url: diretrizLoja.url,
    arquivo: "PV-MER-020_Plano_de_Vendas_Loja.pdf",
  },
  {
    codigo: "DC-MER-008",
    titulo: "Diretriz Consultor de Vendas (PAP)",
    versao: "Versão 008 — aprovada em 01/11/2025",
    url: diretrizPap.url,
    arquivo: "DC-MER-008_Diretriz_Consultor_PAP.pdf",
  },
  {
    codigo: "DC-MER-020",
    titulo: "Diretriz Comercial para Canal Presencial Receptivo",
    versao: "Versão 002 — aprovada em 01/09/2025",
    url: "/circulares/DC-MER-020_Diretriz_Comercial_Canal_Presencial_Receptivo.pdf",
    arquivo: "DC-MER-020_Diretriz_Comercial_Canal_Presencial_Receptivo.pdf",
  },
];

export function DocumentosRegras() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Circulares vigentes</CardTitle>
        <CardDescription>
          Documentos oficiais que originam as regras cadastradas nesta página. Disponíveis para
          download e conferência pelos gestores.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {DOCS.map((d) => (
          <div
            key={d.codigo}
            className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
          >
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {d.codigo} — {d.titulo}
              </p>
              <p className="text-xs text-muted-foreground">{d.versao}</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <a href={d.url} download={d.arquivo} target="_blank" rel="noreferrer">
                <Download className="mr-1 h-4 w-4" /> Baixar PDF
              </a>
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
