/** Tanto o valor legado quanto a seleção vazia representam Todos. */
export function todasPessoas(pessoa: string | string[]) {
  return pessoa === "all" || (Array.isArray(pessoa) && pessoa.length === 0);
}

/** Intervalos separados: nunca inclui um mês entre duas escolhas. */
export function filtroMesesData(coluna: string, meses: string[]) {
  return [...new Set(meses)].sort().map((mes) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error("Mês inválido");
    const [ano, numero] = mes.split("-").map(Number);
    const seguinte = numero === 12 ? `${ano + 1}-01` : `${ano}-${String(numero + 1).padStart(2, "0")}`;
    return `and(${coluna}.gte.${mes}-01,${coluna}.lt.${seguinte}-01)`;
  }).join(",");
}