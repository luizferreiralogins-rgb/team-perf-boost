export type PeriodoBloqueio = { user_id: string; inicio: string; fim: string | null };

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
