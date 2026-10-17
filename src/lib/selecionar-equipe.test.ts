import { describe, expect, it } from "vitest";
import { selecionarEquipe } from "./selecionar-equipe";

const equipe = [
  { id: "gerente-a", gerente_id: null },
  { id: "consultor-a", gerente_id: "gerente-a" },
  { id: "gerente-b", gerente_id: null },
  { id: "consultor-b", gerente_id: "gerente-b" },
  { id: "consultor-c", gerente_id: "gerente-b" },
];
const ids = (selecao: string | string[]) => selecionarEquipe(equipe, selecao).map((m) => m.id);

describe("seleção de gerentes e consultores", () => {
  it("combina dois consultores sem incluir os demais", () => {
    expect(ids(["consultor-a", "consultor-c"])).toEqual(["consultor-a", "consultor-c"]);
  });
  it("combina gerentes e suas equipes sem duplicar consultores", () => {
    expect(ids(["gerente-a", "gerente-b", "consultor-a"])).toEqual(equipe.map((m) => m.id));
  });
  it("combina um gerente com um consultor de outra equipe", () => {
    expect(ids(["gerente-a", "consultor-c"])).toEqual(["gerente-a", "consultor-a", "consultor-c"]);
  });
  it("não expande um gerente ausente da equipe autorizada", () => {
    expect(selecionarEquipe(equipe.slice(1), ["gerente-a"])).toEqual([]);
  });
  it("mantém todos ao limpar a seleção", () => {
    expect(ids([])).toEqual(equipe.map((m) => m.id));
    expect(ids("all")).toEqual(equipe.map((m) => m.id));
  });
});