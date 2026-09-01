/**
 * Regras únicas de contagem de Banda Larga e Móvel.
 * - Banda Larga: protocolos de "Novo Acesso" com o produto 01.04 - Internet - Banda Larga - Fibra.
 * - Móvel: soma das linhas (qtd_linhas) de todos os protocolos (Novo Acesso e Renovação).
 */

export type VendaLojaQtd = {
  tecnologia?: string | null;
  classe_protocolo?: string | null;
  qtd_linhas?: number | null;
};

export type VendaPapQtd = {
  produto?: string | null;
  tecnologia?: string | null;
  tipo_protocolo?: string | null;
  qtd_linhas?: number | null;
};

const isNovoAcesso = (t?: string | null) => (t ?? "").trim().toLowerCase().startsWith("novo acesso");

export function isBlLoja(v: VendaLojaQtd) {
  const tec = (v.tecnologia ?? "").trim();
  return isNovoAcesso(v.classe_protocolo) && tec.startsWith("01.04");
}

export function isBlPap(v: VendaPapQtd) {
  const desc = `${v.produto ?? ""} ${v.tecnologia ?? ""}`;
  return isNovoAcesso(v.tipo_protocolo) && (/01\.04/.test(desc) || /banda\s*larga/i.test(desc));
}

export function linhasMovel(v: { qtd_linhas?: number | null }) {
  return Number(v.qtd_linhas ?? 0) || 0;
}
