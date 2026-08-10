export type CanalKpi = "loja" | "pap";

export type MetasKpi = { bl: number; movel: number; renovRs: number };

/** Metas mensais por consultor, conforme canal. */
export const METAS_POR_CANAL: Record<CanalKpi, MetasKpi> = {
  loja: { bl: 14, movel: 45, renovRs: 1200 },
  pap: { bl: 20, movel: 22, renovRs: 0 },
};

export function metasConsultor(canal?: string | null): MetasKpi {
  return METAS_POR_CANAL[canal === "pap" ? "pap" : "loja"];
}

/** Soma das metas de todos os consultores informados (visão de gestor). */
export function metasEquipe(
  membros: Array<{ canal?: string | null; role?: string | null }>,
): MetasKpi {
  return membros
    .filter((m) => !m.role || m.role === "consultor")
    .reduce<MetasKpi>(
      (acc, m) => {
        const meta = metasConsultor(m.canal);
        return {
          bl: acc.bl + meta.bl,
          movel: acc.movel + meta.movel,
          renovRs: acc.renovRs + meta.renovRs,
        };
      },
      { bl: 0, movel: 0, renovRs: 0 },
    );
}
