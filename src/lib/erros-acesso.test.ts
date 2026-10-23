import { expect, test } from "vitest";
import { erroDeAcesso } from "./erros-acesso";
test("permissão recusada e sessão perdida são erros de acesso, não dados vazios", () => {
  expect(erroDeAcesso({ code: "42501" })).toBe(true);
  expect(erroDeAcesso({ code: "session_not_found" })).toBe(true);
  expect(erroDeAcesso({ code: "refresh_token_not_found" })).toBe(true);
  expect(erroDeAcesso({ code: "23505" })).toBe(false);
  expect(erroDeAcesso(null)).toBe(false);
});