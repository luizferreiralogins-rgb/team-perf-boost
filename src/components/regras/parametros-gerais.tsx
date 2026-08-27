import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

type Row = {
  chave: string;
  label: string;
  descricao: string | null;
  valor_bool: boolean | null;
  ordem: number;
};

export function ParametrosGerais({ editavel }: { editavel: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["parametros-gerais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parametros_gerais")
        .select("chave, label, descricao, valor_bool, ordem")
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  async function alternar(chave: string, valor: boolean) {
    const { error } = await supabase
      .from("parametros_gerais")
      .update({ valor_bool: valor })
      .eq("chave", chave);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Parâmetro atualizado");
    await qc.invalidateQueries({ queryKey: ["parametros-gerais"] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Interpretação das regras</CardTitle>
        <CardDescription>
          Definições das circulares que dependem de uma escolha da operação. Alterar aqui muda o
          cálculo das próximas vendas e dos recálculos de comissão.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          (q.data ?? []).map((p) => (
            <div key={p.chave} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">{p.label}</p>
                {p.descricao && (
                  <p className="text-xs text-muted-foreground">{p.descricao}</p>
                )}
              </div>
              <Switch
                className="mt-1 shrink-0"
                checked={!!p.valor_bool}
                disabled={!editavel}
                onCheckedChange={(v) => alternar(p.chave, v)}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
