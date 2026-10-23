import { expect, test } from "vitest";
import { filtroMesesData, todasPessoas } from "./filtros-vendas";

test("Todos inclui o próprio gestor após limpar a seleção", () => {
  expect(todasPessoas([])).toBe(true);
  expect(todasPessoas("all")).toBe(true);
  expect(todasPessoas(["consultor"])).toBe(false);
});
test("agosto e outubro não incluem setembro", () => {
  expect(filtroMesesData("data_abertura", ["2026-10", "2026-08"])).toBe("and(data_abertura.gte.2026-08-01,data_abertura.lt.2026-09-01),and(data_abertura.gte.2026-10-01,data_abertura.lt.2026-11-01)");
});
test("dezembro termina no primeiro dia do ano seguinte", () => {
  expect(filtroMesesData("data_venda", ["2026-12"])).toBe("and(data_venda.gte.2026-12-01,data_venda.lt.2027-01-01)");
});