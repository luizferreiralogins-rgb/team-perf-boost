import { describe, expect, it } from "vitest";
import { calcularComissaoLider, faixaLider } from "./comissao-lider";

const c = (vals: number[]) => vals.map((v, i) => ({ id: String(i), nome: String(i), atingimento: v }));

describe("comissão Líder PAP (DC-MER-005)", () => {
  it("exemplo 1: 2 colaboradores = R$ 900", () => {
    expect(calcularComissaoLider(c([2100, 3100])).comissao).toBe(900);
  });
  it("exemplo 2: 5 colaboradores = R$ 2.835", () => {
    expect(calcularComissaoLider(c([2600, 1800, 3400, 2900, 3800])).comissao).toBe(2835);
  });
  it("exemplo 3: 8 colaboradores = R$ 6.255", () => {
    expect(calcularComissaoLider(c([2300, 3100, 4200, 2700, 3600, 4000, 3300, 3900])).comissao).toBe(6255);
  });
  it("teto: 1 colaborador limita a 12,5%", () => {
    expect(calcularComissaoLider(c([5000])).comissao).toBe(1125);
  });
  it("R$ 2.000,00 ainda é faixa 1 (0%)", () => {
    expect(faixaLider(2000).pct).toBe(0);
    expect(faixaLider(2000.01).faixa).toBe(2);
  });
});
