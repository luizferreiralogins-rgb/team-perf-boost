import { expect, test } from "vitest";
import { precisaRegistrarIndicador } from "./indicacao-edicao";

test("editar venda Indique Ganhe existente não exige nem duplica indicação", () => {
  expect(precisaRegistrarIndicador("venda", "Indique Ganhe", "Indique Ganhe")).toBe(false);
});
test("nova venda e mudança para Indique Ganhe exigem indicação", () => {
  expect(precisaRegistrarIndicador(undefined, undefined, "Indique Ganhe")).toBe(true);
  expect(precisaRegistrarIndicador("venda", "Loja", "Indique Ganhe")).toBe(true);
  expect(precisaRegistrarIndicador("venda", "Loja", "Loja")).toBe(false);
});