type PessoaEquipe = { id: string; gerente_id: string | null };

/** Expande as pessoas escolhidas somente dentro da equipe já autorizada. */
export function selecionarEquipe<T extends PessoaEquipe>(membros: T[], selecao: string | string[]): T[] {
  const ids = typeof selecao === "string" ? (selecao === "all" ? [] : [selecao]) : selecao;
  if (ids.length === 0) return membros;
  const visiveis = new Set(membros.map((m) => m.id));
  const selecionados = new Set(ids.filter((id) => visiveis.has(id)));
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const m of membros) {
      if (m.gerente_id && selecionados.has(m.gerente_id) && !selecionados.has(m.id)) {
        selecionados.add(m.id);
        mudou = true;
      }
    }
  }
  return membros.filter((m) => selecionados.has(m.id));
}