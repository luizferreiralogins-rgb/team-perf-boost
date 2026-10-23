export type PeriodoBloqueio = { user_id: string; inicio: string; fim: string | null };

/** Bloqueios atuais, sem depender do mês selecionado, restritos aos consultores da equipe autorizada. */
export function consultoresComBloqueio<T extends { id: string; nome: string; role: string }>(equipe: T[], periodos: PeriodoBloqueio[]) {
  const bloqueados = new Set(periodos.filter((p) => p.fim === null).map((p) => p.user_id));
  return equipe.filter((m) => m.role === "consultor" && bloqueados.has(m.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Minutos bloqueados de cada período que caem dentro de [ini, fim) do mês; período aberto conta até `agora`. */
export function minutosBloqueadoNoMes(periodos: PeriodoBloqueio[], ini: Date, fim: Date, agora: Date = new Date()) {
  const lim = Math.min(fim.getTime(), agora.getTime());
  let ms = 0;
  for (const p of periodos) {
    const a = Math.max(new Date(p.inicio).getTime(), ini.getTime());
    const b = Math.min(p.fim ? new Date(p.fim).getTime() : agora.getTime(), lim);
    if (b > a) ms += b - a;
  }
  return ms / 60000;
}
