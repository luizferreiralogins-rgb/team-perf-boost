import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export type ColKind = "text" | "number" | "currency" | "percent" | "bool";

export type ColDef = {
  key: string;
  label: string;
  kind: ColKind;
  width?: string;
  /** desabilita edição (ex.: chave primária de linhas já salvas) */
  lockOnEdit?: boolean;
};

type Row = Record<string, unknown>;

function toInput(v: unknown, kind: ColKind): string {
  if (v === null || v === undefined) return "";
  if (kind === "percent") return String(Number(v) * 100);
  return String(v);
}

function fromInput(s: string, kind: ColKind): unknown {
  if (kind === "text") return s;
  if (kind === "percent") return (parseFloat(s.replace(",", ".")) || 0) / 100;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function ParamTable({
  table,
  title,
  description,
  pk,
  cols,
  orderBy,
  novoPadrao,
  editavel,
}: {
  table: string;
  title: string;
  description?: string;
  pk: string;
  cols: ColDef[];
  orderBy: string;
  novoPadrao: Row;
  editavel: boolean;
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [removidos, setRemovidos] = useState<unknown[]>([]);

  const q = useQuery({
    queryKey: ["param", table],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as never)
        .select("*")
        .order(orderBy);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  useEffect(() => {
    if (q.data) {
      setRows(
        q.data.map((r) => {
          const out: Row = { ...r };
          for (const c of cols) if (c.kind !== "bool") out[c.key] = toInput(r[c.key], c.kind);
          return out;
        }),
      );
      setRemovidos([]);
    }
  }, [q.data]);

  function set(i: number, key: string, value: unknown) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }

  function addRow() {
    const base: Row = { __novo: true };
    for (const c of cols)
      base[c.key] = c.kind === "bool" ? !!novoPadrao[c.key] : toInput(novoPadrao[c.key], c.kind);
    setRows((prev) => [...prev, base]);
  }

  function delRow(i: number) {
    setRows((prev) => {
      const r = prev[i];
      if (!r.__novo && r[pk] !== undefined) setRemovidos((d) => [...d, r[pk]]);
      return prev.filter((_, idx) => idx !== i);
    });
  }

  async function salvar() {
    setSaving(true);
    try {
      if (removidos.length) {
        const { error } = await supabase
          .from(table as never)
          .delete()
          .in(pk, removidos as never[]);
        if (error) throw error;
      }
      const payload = rows.map((r) => {
        const out: Row = {};
        for (const c of cols)
          out[c.key] = c.kind === "bool" ? !!r[c.key] : fromInput(String(r[c.key] ?? ""), c.kind);
        if (r[pk] !== undefined && !cols.some((c) => c.key === pk)) out[pk] = r[pk];
        if (r.__novo && typeof r[pk] === "undefined") delete out[pk];
        return out;
      });
      if (payload.length) {
        const { error } = await supabase
          .from(table as never)
          .upsert(payload as never[], { onConflict: pk });
        if (error) throw error;
      }
      toast.success("Regras salvas");
      await qc.invalidateQueries({ queryKey: ["param", table] });
      qc.invalidateQueries({ queryKey: ["parametros-loja-faixas"] });
      qc.invalidateQueries({ queryKey: ["parametros-pap-faixas"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {editavel && (
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus className="mr-1 h-4 w-4" /> Linha
            </Button>
            <Button size="sm" onClick={salvar} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              Salvar
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  {cols.map((c) => (
                    <th key={c.key} className="px-2 py-2 font-medium">
                      {c.label}
                    </th>
                  ))}
                  {editavel && <th className="w-10" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={String(r[pk] ?? `novo-${i}`)} className="border-b last:border-0">
                    {cols.map((c) => (
                      <td key={c.key} className="px-2 py-1.5">
                        {c.kind === "bool" ? (
                          <Checkbox
                            checked={!!r[c.key]}
                            disabled={!editavel}
                            onCheckedChange={(v) => set(i, c.key, !!v)}
                          />
                        ) : (
                          <Input
                            className="h-8"
                            style={c.width ? { width: c.width } : undefined}
                            disabled={!editavel || (c.lockOnEdit && !r.__novo)}
                            inputMode={c.kind === "text" ? "text" : "decimal"}
                            value={String(r[c.key] ?? "")}
                            onChange={(e) => set(i, c.key, e.target.value)}
                          />
                        )}
                      </td>
                    ))}
                    {editavel && (
                      <td className="px-2 py-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => delRow(i)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td
                      colSpan={cols.length + 1}
                      className="px-2 py-6 text-center text-muted-foreground"
                    >
                      Nenhuma regra cadastrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
