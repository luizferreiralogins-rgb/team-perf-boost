import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "vitest";

// Run explicitly with PROSP_LIMPEZA_SESSION_FILE pointing to an authorized test session.
const sessionPath = process.env.PROSP_LIMPEZA_SESSION_FILE;
test.skipIf(!sessionPath)("limpa apenas o status escolhido, arquiva e preserva os demais", async () => {
  if (!sessionPath) throw new Error("Sessão de teste ausente");
  const { session } = JSON.parse(readFileSync(sessionPath, "utf8"));
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Configuração de teste ausente");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${session.access_token}` } } });
  const nome = "__teste_limpeza_status_20261021__";
  const before = await db.from("prospeccoes").select("status").eq("nome_cliente", nome);
  expect(before.error).toBeNull();
  expect(before.data?.map((r) => r.status).sort()).toEqual(["__teste_manter__", "__teste_remover__"]);
  const result = await db.rpc("limpar_prospeccoes_por_status", { _status: ["__teste_remover__"], _sem_status: false });
  expect(result.error).toBeNull();
  expect(result.data).toBe(1);
  const remaining = await db.from("prospeccoes").select("status").eq("nome_cliente", nome);
  expect(remaining.error).toBeNull();
  expect(remaining.data).toEqual([{ status: "__teste_manter__" }]);
  const archived = await db.from("prospeccoes_historico").select("status").eq("nome_cliente", nome);
  expect(archived.error).toBeNull();
  expect(archived.data).toEqual([{ status: "__teste_remover__" }]);
});

test.skipIf(!sessionPath)("recusa limpeza sem selecionar nenhum status", async () => {
  if (!sessionPath) throw new Error("Sessão de teste ausente");
  const { session } = JSON.parse(readFileSync(sessionPath, "utf8"));
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Configuração de teste ausente");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${session.access_token}` } } });
  const result = await db.rpc("limpar_prospeccoes_por_status", { _status: [], _sem_status: false });
  expect(result.error?.code).toBe("22023");
});