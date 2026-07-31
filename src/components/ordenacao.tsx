import { useMemo, useState } from "react";
import { ArrowDownUp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type OpcaoOrdenacao<T> = {
  /** chave única da opção */
  valor: string;
  /** rótulo exibido ao usuário */
  label: string;
  /** comparador de ordenação */
  cmp: (a: T, b: T) => number;
};

/** Comparadores prontos */
export const cmpTexto =
  <T,>(get: (x: T) => string | null | undefined) =>
  (a: T, b: T) =>
    (get(a) ?? "").localeCompare(get(b) ?? "", "pt-BR", { sensitivity: "base" });

export const cmpNumeroDesc =
  <T,>(get: (x: T) => number | null | undefined) =>
  (a: T, b: T) =>
    (Number(get(b)) || 0) - (Number(get(a)) || 0);

export const cmpNumeroAsc =
  <T,>(get: (x: T) => number | null | undefined) =>
  (a: T, b: T) =>
    (Number(get(a)) || 0) - (Number(get(b)) || 0);

const ts = (v: string | null | undefined) => (v ? new Date(v).getTime() || 0 : 0);

export const cmpDataDesc =
  <T,>(get: (x: T) => string | null | undefined) =>
  (a: T, b: T) =>
    ts(get(b)) - ts(get(a));

export const cmpDataAsc =
  <T,>(get: (x: T) => string | null | undefined) =>
  (a: T, b: T) =>
    ts(get(a)) - ts(get(b));

/**
 * Ordenação reutilizável para listas.
 * Retorna as linhas ordenadas e o seletor pronto para renderizar.
 */
export function useOrdenacao<T>(rows: T[], opcoes: OpcaoOrdenacao<T>[], inicial?: string) {
  const [ordem, setOrdem] = useState(inicial ?? opcoes[0]?.valor ?? "");

  const ordenadas = useMemo(() => {
    const op = opcoes.find((o) => o.valor === ordem) ?? opcoes[0];
    if (!op) return rows;
    return [...rows].sort(op.cmp);
  }, [rows, ordem, opcoes]);

  const control = (
    <div className="flex items-center gap-2">
      <ArrowDownUp className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Select value={ordem} onValueChange={setOrdem}>
        <SelectTrigger className="h-9 w-[190px]" aria-label="Classificar lista">
          <SelectValue placeholder="Classificar por" />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => (
            <SelectItem key={o.valor} value={o.valor}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return { rows: ordenadas, ordem, setOrdem, control };
}
