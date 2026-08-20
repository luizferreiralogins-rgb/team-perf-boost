import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Aniversariante = { id: string; nome: string; sou_eu: boolean };
export type ProximoAniversariante = {
  id: string;
  nome: string;
  dias_faltando: number;
  sou_eu: boolean;
};

/** Aniversariantes do dia dentro da equipe do usuário logado. */
export function useAniversariantes() {
  return useQuery({
    queryKey: ["aniversariantes-hoje"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("aniversariantes_hoje");
      if (error) return [] as Aniversariante[];
      return (data ?? []) as Aniversariante[];
    },
    staleTime: 10 * 60_000,
  });
}

/** Próximo aniversariante da equipe do usuário logado. */
export function useProximoAniversariante() {
  return useQuery({
    queryKey: ["proximo-aniversariante"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("proximo_aniversariante");
      if (error) return null;
      const row = (data ?? [])[0];
      if (!row) return null;
      return row as ProximoAniversariante;
    },
    staleTime: 10 * 60_000,
  });
}

/** Frase de aniversário para exibir ao final da frase do dia. */
export function fraseAniversario(lista: Aniversariante[] | undefined) {
  if (!lista?.length) return null;
  const eu = lista.find((a) => a.sou_eu);
  const outros = lista.filter((a) => !a.sou_eu).map((a) => a.nome.split(" ")[0]);
  const partes: string[] = [];
  if (eu) partes.push("Parabéns pelo seu aniversário! 🎂");
  if (outros.length) {
    const nomes =
      outros.length > 1
        ? `${outros.slice(0, -1).join(", ")} e ${outros[outros.length - 1]}`
        : outros[0];
    partes.push(
      outros.length > 1
        ? `Ahhh!!! Hoje é aniversário de ${nomes}! 🎉`
        : `Ahhh!!! Hoje é aniversário do(a) ${nomes}! 🎉`,
    );
  }
  return partes.join(" ");
}

/** Frase do próximo aniversariante da equipe. */
export function fraseProximoAniversariante(
  proximo: ProximoAniversariante | null | undefined,
) {
  if (!proximo) return null;
  const nome = proximo.nome.split(" ")[0];
  const sufixo = proximo.sou_eu ? "seu" : `do(a) ${nome}`;
  return `Faltam ${proximo.dias_faltando} dias para o aniversário ${sufixo}. 👏🎂`;
}
