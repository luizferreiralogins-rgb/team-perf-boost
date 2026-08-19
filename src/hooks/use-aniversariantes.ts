import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Aniversariante = { id: string; nome: string; sou_eu: boolean };

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
