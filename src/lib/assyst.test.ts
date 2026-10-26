import { describe, expect, it } from "vitest";
import { copiarEAbrirAssyst, URL_ASSYST } from "./assyst";

describe("copiarEAbrirAssyst", () => {
  it("copia o protocolo e abre exatamente o link da Assyst", async () => {
    const copiados: string[] = [];
    const abertas: string[] = [];

    const resultado = await copiarEAbrirAssyst("ASSYST-00123", {
      copiar: (texto) => {
        copiados.push(texto);
        return true;
      },
      abrir: (url) => {
        abertas.push(url);
      },
    });

    expect(copiados).toEqual(["ASSYST-00123"]);
    expect(abertas).toEqual([
      "https://assyst.unifique.com.br/assystweb/application.do#welcome%2FWelcomeDispatchAction.do?dispatch=refresh",
    ]);
    expect(resultado).toBe("copiado");
  });

  it("ainda abre a Assyst quando a cópia falha, avisando o usuário", async () => {
    const abertas: string[] = [];

    const resultado = await copiarEAbrirAssyst("999", {
      copiar: () => false,
      abrir: (url) => {
        abertas.push(url);
      },
    });

    expect(abertas).toEqual([URL_ASSYST]);
    expect(resultado).toBe("nao_copiado");
  });
});
