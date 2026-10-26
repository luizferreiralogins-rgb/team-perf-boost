import { expect, test } from "vitest";
import { consultorDaPlanilha, lerProspecto, preservarProspectoAtual } from "./prospeccoes-importacao";

test("mapeia o novo padrão Assyst e preserva protocolo, cidade, datas e observação", () => {
  expect(lerProspecto({ Consultor: "Amabile", "Data Contato": "26/10/2026", Status: "Contato feito", Protocolo: 10984102, "Data registro": "07/10/2026 08:32", "Nome afetado": "Cliente", Categoria: "RENOVACAO_CONTRATUAL", Cidade: "Araquari", Plano: "Fibra", Observação: "Ligar" }, [{ chave: "contato_feito", nome: "Contato feito" }])).toMatchObject({ consultor_planilha: "Amabile", data_contato: "2026-10-26", status: "contato_feito", protocolo: "10984102", nome_cliente: "Cliente", unidade: "Araquari", plano: "Fibra", observacao: "Ligar" });
});
test("mantém Contato feito", () => expect(preservarProspectoAtual("contato_feito")).toBe(true));
test("mantém Negociando", () => expect(preservarProspectoAtual("negociando")).toBe(true));
test("mantém Fechado", () => expect(preservarProspectoAtual("fechado")).toBe(true));
test("não mantém outros status ou clientes não contatados", () => { for (const s of [null, "declinou", "nao_perturbar", "sem_whatsapp", "ativo_outro_protocolo_muzi04f3"]) expect(preservarProspectoAtual(s)).toBe(false); });
test("Consultor da planilha corresponde apenas a um membro da equipe", () => {
  expect(consultorDaPlanilha("LETÍCIA", [{ id: "a", nome: "Leticia" }])).toBe("a");
  expect(() => consultorDaPlanilha("Outra", [{ id: "a", nome: "Leticia" }])).toThrow();
});
test("não descarta silenciosamente status desconhecido", () => expect(() => lerProspecto({ "Nome afetado": "Cliente", Status: "inexistente" }, [])).toThrow());