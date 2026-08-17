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

export type UnidadeLoja = { id: string; nome: string; ordem: number };

export function useUnidades() {
  return useQuery({
    queryKey: ["unidades-loja"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unidades_loja")
        .select("id, nome, ordem")
        .order("ordem", { ascending: true })
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as UnidadeLoja[];
    },
    staleTime: 60_000,
  });
}

/** Select de unidade da loja, alimentado pela lista cadastrada. */
export function SelectUnidade({
  value,
  onChange,
  placeholder = "Selecione",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const { data, isLoading } = useUnidades();
  const extras =
    value && !(data ?? []).some((u) => u.nome === value) ? [{ id: value, nome: value, ordem: 0 }] : [];
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? "Carregando..." : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {[...extras, ...(data ?? [])].map((u) => (
          <SelectItem key={u.id} value={u.nome}>
            {u.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** CRUD das unidades — Gerentes, Líderes PAP e Acesso Master. */
export function UnidadesConfig() {
  const qc = useQueryClient();
  const { data: unidades, isLoading } = useUnidades();
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [novo, setNovo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (unidades) setCampos(Object.fromEntries(unidades.map((u) => [u.id, u.nome])));
  }, [unidades]);

  function invalidar() {
    qc.invalidateQueries({ queryKey: ["unidades-loja"] });
    qc.invalidateQueries({ queryKey: ["team"] });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      for (const u of unidades ?? []) {
        const nome = (campos[u.id] ?? "").trim();
        if (!nome) throw new Error("O nome da unidade não pode ficar vazio.");
        if (nome === u.nome) continue;
        const { error } = await supabase.from("unidades_loja").update({ nome }).eq("id", u.id);
        if (error) throw error;
        // Mantém os colaboradores vinculados à unidade renomeada
        await supabase.from("profiles").update({ loja_unidade: nome }).eq("loja_unidade", u.nome);
      }
      toast.success("Unidades atualizadas.");
      invalidar();
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao salvar unidades.");
    } finally {
      setSaving(false);
    }
  }

  async function adicionar() {
    const nome = novo.trim();
    if (!nome) {
      toast.error("Informe o nome da unidade.");
      return;
    }
    setSaving(true);
    const ordem = Math.max(0, ...(unidades ?? []).map((u) => u.ordem)) + 1;
    const { error } = await supabase.from("unidades_loja").insert({ nome, ordem });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNovo("");
    toast.success("Unidade criada.");
    invalidar();
  }

  async function excluir(id: string, nome: string) {
    if (!window.confirm(`Excluir a unidade "${nome}"?`)) return;
    const { error } = await supabase.from("unidades_loja").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Unidade excluída.");
    invalidar();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unidades das lojas</CardTitle>
        <CardDescription>
          Crie, renomeie ou exclua as unidades disponíveis para vincular os colaboradores do canal Loja.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={salvar} className="grid gap-3">
          {isLoading && <Skeleton className="h-24 w-full" />}
          {(unidades ?? []).map((u) => (
            <div key={u.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <Label htmlFor={`unidade-${u.id}`}>Nome</Label>
                <Input
                  id={`unidade-${u.id}`}
                  value={campos[u.id] ?? ""}
                  onChange={(e) => setCampos((p) => ({ ...p, [u.id]: e.target.value }))}
                />
              </div>
              <Button type="button" variant="outline" onClick={() => excluir(u.id, u.nome)} disabled={saving}>
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
            <Label htmlFor="nova-unidade">Nova unidade</Label>
            <Input
              id="nova-unidade"
              placeholder="Nome da unidade"
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
