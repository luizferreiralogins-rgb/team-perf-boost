import { describe, expect, it } from "vitest";
import { consultoresComBloqueio, minutosBloqueadoNoMes } from "./whatsapp-bloqueio";

const ini = new Date("2026-10-01T00:00:00Z");
const fim = new Date("2026-11-01T00:00:00Z");

describe("consultoresComBloqueio", () => {
  const equipe = [
    { id: "loja", nome: "Ana", role: "consultor" },
    { id: "pap", nome: "Bruno", role: "consultor" },
    { id: "gestor", nome: "Gestor", role: "gerente" },
  ];
  it("inclui bloqueios ativos de consultores Loja e PAP mesmo iniciados em outro mês", () => {
    expect(consultoresComBloqueio(equipe, [
      { user_id: "loja", inicio: "2026-09-01T00:00:00Z", fim: null },
      { user_id: "pap", inicio: "2026-10-23T00:00:00Z", fim: null },
    ]).map((m) => m.id)).toEqual(["loja", "pap"]);
  });
  it("exclui bloqueios encerrados", () => {
    expect(consultoresComBloqueio(equipe, [
      { user_id: "loja", inicio: "2026-10-01T00:00:00Z", fim: "2026-10-02T00:00:00Z" },
    ])).toEqual([]);
  });
  it("não inclui gestores nem consultores fora da equipe e não duplica nomes", () => {
    expect(consultoresComBloqueio(equipe, ["loja", "loja", "gestor", "fora"].map((user_id) => ({ user_id, inicio: "2026-10-23T00:00:00Z", fim: null }))).map((m) => m.id)).toEqual(["loja"]);
  });
});

describe("minutosBloqueadoNoMes", () => {
  it("conta só a parte dentro do mês", () => {
    const p = [{ user_id: "a", inicio: "2026-09-30T23:00:00Z", fim: "2026-10-01T01:00:00Z" }];
    expect(minutosBloqueadoNoMes(p, ini, fim, new Date("2026-10-20T00:00:00Z"))).toBe(60);
  });
  it("período aberto conta até agora", () => {
    const p = [{ user_id: "a", inicio: "2026-10-20T10:00:00Z", fim: null }];
    expect(minutosBloqueadoNoMes(p, ini, fim, new Date("2026-10-20T12:30:00Z"))).toBe(150);
  });
});
