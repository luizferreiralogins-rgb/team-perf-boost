import { describe, expect, it } from "vitest";
import { minutosBloqueadoNoMes } from "./whatsapp-bloqueio";

const ini = new Date("2026-10-01T00:00:00Z");
const fim = new Date("2026-11-01T00:00:00Z");

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
