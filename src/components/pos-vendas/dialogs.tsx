import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type Resultado = "neutro" | "sem_resposta" | "satisfeito" | "suporte" | "insatisfeito";

export const RESULTADOS: { value: Resultado; label: string }[] = [
  { value: "satisfeito", label: "Satisfeito" },
  { value: "neutro", label: "Neutro" },
  { value: "sem_resposta", label: "Sem resposta" },
  { value: "suporte", label: "Suporte solicitado" },
  { value: "insatisfeito", label: "Insatisfeito" },
];

export const labelResultado = (r?: string | null) =>
  RESULTADOS.find((x) => x.value === r)?.label ?? "—";

export type VendaAlvo = {
  id: string;
  tabela: "vendas_loja" | "vendas_pap";
  vendedorId: string;
  cliente: string;
};

function useRegistrar(onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("pos_venda_contatos")
        .insert({ ...payload, criado_por: auth.user!.id } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contato de pós-venda registrado.");
      qc.invalidateQueries({ queryKey: ["pos-venda-contatos"] });
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao registrar o contato."),
  });
}

export function DialogSatisfacao({
  venda,
  open,
  onOpenChange,
}: {
  venda: VendaAlvo | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");

  const fechar = () => {
    setResultado(null);
    setMotivo("");
    setObservacao("");
    onOpenChange(false);
  };
  const registrar = useRegistrar(fechar);

  const precisaMotivo = resultado === "insatisfeito";
  const invalido = !resultado || (precisaMotivo && motivo.trim().length < 5);

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : fechar())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contato de satisfação</DialogTitle>
          <DialogDescription>
            {venda?.cliente} — Como está sendo a experiência até o momento?
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {RESULTADOS.map((r) => (
            <Button
              key={r.value}
              type="button"
              size="sm"
              variant={resultado === r.value ? "default" : "outline"}
              className={cn(resultado === r.value && "ring-2 ring-ring")}
              onClick={() => setResultado(r.value)}
            >
              {r.label}
            </Button>
          ))}
        </div>

        {precisaMotivo && (
          <div className="space-y-1.5">
            <Label htmlFor="motivo-insatisfacao">Motivo da insatisfação</Label>
            <Textarea
              id="motivo-insatisfacao"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Descreva o motivo relatado pelo cliente"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="obs-satisfacao">Observações (opcional)</Label>
          <Textarea
            id="obs-satisfacao"
            rows={3}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={fechar}>
            Cancelar
          </Button>
          <Button
            disabled={invalido || registrar.isPending || !venda}
            onClick={() =>
              venda &&
              registrar.mutate({
                tabela: venda.tabela,
                venda_id: venda.id,
                vendedor_id: venda.vendedorId,
                fase: "satisfacao",
                resultado,
                motivo: motivo.trim() || null,
                observacao: observacao.trim() || null,
              })
            }
          >
            Salvar registro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ProdutoKey = "banda_larga" | "movel" | "tv" | "telemedicina" | "cameras" | "mesh";

const PRODUTOS: { key: ProdutoKey; label: string; extra?: "velocidade" | "linhas" }[] = [
  { key: "banda_larga", label: "Banda Larga", extra: "velocidade" },
  { key: "movel", label: "Móvel", extra: "linhas" },
  { key: "tv", label: "TV" },
  { key: "telemedicina", label: "Telemedicina" },
  { key: "cameras", label: "Câmeras" },
  { key: "mesh", label: "Ponto adicional mesh" },
];

type LinhaProduto = { contratado: boolean; ofertado: boolean; detalhe: string };

const estadoInicial = () =>
  Object.fromEntries(
    PRODUTOS.map((p) => [p.key, { contratado: false, ofertado: false, detalhe: "" }]),
  ) as Record<ProdutoKey, LinhaProduto>;

export function DialogNovosProdutos({
  venda,
  open,
  onOpenChange,
}: {
  venda: VendaAlvo | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [linhas, setLinhas] = useState<Record<ProdutoKey, LinhaProduto>>(estadoInicial);
  const [observacao, setObservacao] = useState("");

  const fechar = () => {
    setLinhas(estadoInicial());
    setObservacao("");
    onOpenChange(false);
  };
  const registrar = useRegistrar(fechar);

  const set = (key: ProdutoKey, patch: Partial<LinhaProduto>) =>
    setLinhas((s) => ({ ...s, [key]: { ...s[key], ...patch } }));

  const algoMarcado = PRODUTOS.some((p) => linhas[p.key].contratado || linhas[p.key].ofertado);

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : fechar())}>
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Oferta de novos produtos</DialogTitle>
          <DialogDescription>
            {venda?.cliente} — Quais outros produtos podem ser ofertados? Marque o que o cliente já
            tem e o que foi ofertado neste contato.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {PRODUTOS.map((p) => (
            <div key={p.key} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-4">
                <span className="min-w-40 text-sm font-medium">{p.label}</span>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={linhas[p.key].contratado}
                    onCheckedChange={(v) => set(p.key, { contratado: v === true })}
                  />
                  Já contratado
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={linhas[p.key].ofertado}
                    onCheckedChange={(v) => set(p.key, { ofertado: v === true })}
                  />
                  Ofertado
                </label>
              </div>
              {p.extra && (linhas[p.key].contratado || linhas[p.key].ofertado) && (
                <div className="mt-2 max-w-xs space-y-1">
                  <Label className="text-xs">
                    {p.extra === "velocidade" ? "Qual velocidade?" : "Quantidade de linhas"}
                  </Label>
                  <Input
                    value={linhas[p.key].detalhe}
                    onChange={(e) => set(p.key, { detalhe: e.target.value })}
                    placeholder={p.extra === "velocidade" ? "Ex.: 600 Mega" : "Ex.: 2"}
                    inputMode={p.extra === "linhas" ? "numeric" : "text"}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="obs-produtos">Observações (opcional)</Label>
          <Textarea
            id="obs-produtos"
            rows={3}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={fechar}>
            Cancelar
          </Button>
          <Button
            disabled={!algoMarcado || registrar.isPending || !venda}
            onClick={() =>
              venda &&
              registrar.mutate({
                tabela: venda.tabela,
                venda_id: venda.id,
                vendedor_id: venda.vendedorId,
                fase: "produtos",
                produtos: linhas,
                observacao: observacao.trim() || null,
              })
            }
          >
            Salvar registro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ResumoProdutos({ produtos }: { produtos: unknown }) {
  const obj = (produtos ?? {}) as Record<string, LinhaProduto>;
  const itens = PRODUTOS.filter((p) => obj[p.key]?.contratado || obj[p.key]?.ofertado).map((p) => {
    const l = obj[p.key];
    const tags = [l.contratado ? "já tem" : null, l.ofertado ? "ofertado" : null]
      .filter(Boolean)
      .join(", ");
    return `${p.label}${l.detalhe ? ` (${l.detalhe})` : ""} — ${tags}`;
  });
  if (itens.length === 0) return <span className="text-muted-foreground">—</span>;
  return <span>{itens.join(" · ")}</span>;
}
