import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TipoCanal = "venda" | "atendimento" | "produtividade";

/** Chave estável derivada do nome (usada para tipos de produtividade). */
export function slugCanal(nome: string) {
  return (
    nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "outro"
  );
}

export type OpcaoCanal = {
  id: string;
  tipo: TipoCanal;
  nome: string;
  ordem: number;
};

export function useCanais(tipo: TipoCanal) {
  return useQuery({
    queryKey: ["opcoes-canais", tipo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opcoes_canais")
        .select("id, tipo, nome, ordem")
        .eq("tipo", tipo)
        .order("ordem", { ascending: true })
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OpcaoCanal[];
    },
  });
}

/** Select reutilizável de canais, obrigatório no formulário. */
export function SelectCanal({
  tipo,
  value,
  onChange,
  placeholder = "Selecione",
  porChave = false,
}: {
  tipo: TipoCanal;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** usa a chave derivada do nome como valor (em vez do nome) */
  porChave?: boolean;
}) {
  const { data, isLoading } = useCanais(tipo);
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? "Carregando..." : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {(data ?? []).map((c) => (
          <SelectItem key={c.id} value={porChave ? slugCanal(c.nome) : c.nome}>
            {c.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** CRUD dos canais — visível apenas para o Acesso Master. */
export function CanaisConfig({
  tipo,
  titulo,
  descricao,
}: {
  tipo: TipoCanal;
  titulo: string;
  descricao: string;
}) {
  const qc = useQueryClient();
  const { data: canais, isLoading } = useCanais(tipo);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [novo, setNovo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (canais) setCampos(Object.fromEntries(canais.map((c) => [c.id, c.nome])));
  }, [canais]);

  function invalidar() {
    qc.invalidateQueries({ queryKey: ["opcoes-canais", tipo] });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      for (const c of canais ?? []) {
        const nome = (campos[c.id] ?? "").trim();
        if (!nome) throw new Error("O nome do canal não pode ficar vazio.");
        if (nome === c.nome) continue;
        const { error } = await supabase.from("opcoes_canais").update({ nome }).eq("id", c.id);
        if (error) throw error;
      }
      toast.success("Canais atualizados.");
      invalidar();
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao salvar canais.");
    } finally {
      setSaving(false);
    }
  }

  async function adicionar() {
    const nome = novo.trim();
    if (!nome) {
      toast.error("Informe o nome do canal.");
      return;
    }
    setSaving(true);
    const ordem = Math.max(0, ...(canais ?? []).map((c) => c.ordem)) + 1;
    const { error } = await supabase.from("opcoes_canais").insert({ tipo, nome, ordem });
    if (!error && tipo === "produtividade") {
      await supabase
        .from("parametros_tempos")
        .upsert({ chave: slugCanal(nome), label: nome, minutos: 25, ordem }, { onConflict: "chave" });
      qc.invalidateQueries({ queryKey: ["parametros-tempos"] });
    }
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNovo("");
    toast.success("Canal criado.");
    invalidar();
  }

  async function excluir(id: string, nome: string) {
    if (!window.confirm(`Excluir o canal "${nome}"?`)) return;
    const { error } = await supabase.from("opcoes_canais").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Canal excluído.");
    invalidar();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={salvar} className="grid gap-3">
          {isLoading && <Skeleton className="h-24 w-full" />}
          {(canais ?? []).map((c) => (
            <div key={c.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <Label htmlFor={`canal-${c.id}`}>Nome</Label>
                <Input
                  id={`canal-${c.id}`}
                  value={campos[c.id] ?? ""}
                  onChange={(e) => setCampos((p) => ({ ...p, [c.id]: e.target.value }))}
                />
              </div>
              <Button type="button" variant="outline" onClick={() => excluir(c.id, c.nome)} disabled={saving}>
                Excluir
              </Button>
            </div>
          ))}
          <div className="flex justify-end">
            <Button type="submit" disabled={saving || isLoading}>
              {saving ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </form>

        <div className="grid gap-2 border-t pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <Label htmlFor={`novo-canal-${tipo}`}>Novo canal</Label>
            <Input
              id={`novo-canal-${tipo}`}
              placeholder="Nome do canal"
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
            />
          </div>
          <Button type="button" onClick={adicionar} disabled={saving}>
            Adicionar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
