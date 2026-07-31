import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const salvarRelatorioContestacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z
      .object({
        canal: z.enum(["loja", "pap"]),
        mes_ref: z.string().regex(/^\d{4}-\d{2}$/),
        linhas: z
          .array(
            z.object({
              protocolo: z.string().trim().min(1).max(120),
              vendedor: z.string().trim().min(1).max(160),
              classe: z.string().trim().max(200),
              tecnologia: z.string().trim().max(200),
              valor_novo: z.number().finite(),
              valor_antigo: z.number().finite(),
              diferenca: z.number().finite(),
              faixa: z.number().finite().min(0).max(100),
              comissao: z.number().finite(),
            }),
          )
          .min(1)
          .max(5000),
      })
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!(roles ?? []).some((row) => (row.role === "gerente" || row.role === "lider_pap"))) {
      throw new Error("Apenas Gerentes podem publicar o relatório da própria equipe.");
    }

    const mes = `${data.mes_ref}-01`;
    const { data: anteriores, error: buscaErro } = await context.supabase
      .from("contestacao_importacoes")
      .select("id")
      .eq("gerente_id", context.userId)
      .eq("mes_ref", mes)
      .eq("canal", data.canal);
    if (buscaErro) throw new Error(buscaErro.message);

    if (anteriores?.length) {
      const { error } = await context.supabase
        .from("contestacao_importacoes")
        .delete()
        .in("id", anteriores.map((row) => row.id));
      if (error) throw new Error(error.message);
    }

    const { data: importacao, error: impErro } = await context.supabase
      .from("contestacao_importacoes")
      .insert({
        mes_ref: mes,
        canal: data.canal,
        arquivo_nome: "Colagem do Excel",
        total_linhas: data.linhas.length,
        criado_por: context.userId,
        gerente_id: context.userId,
      })
      .select("id")
      .single();
    if (impErro || !importacao) throw new Error(impErro?.message ?? "Não foi possível criar o relatório.");

    const rows = data.linhas.map((linha) => ({
      importacao_id: importacao.id,
      mes_ref: mes,
      canal: data.canal,
      protocolo: linha.protocolo,
      nome_cliente: "(não informado)",
      consultor_nome: linha.vendedor,
      classe_protocolo: linha.classe || null,
      tecnologia: linha.tecnologia || null,
      valor_novo: linha.valor_novo,
      valor_antigo: linha.valor_antigo,
      diferenca: linha.diferenca,
      faixa: linha.faixa,
      comissao: linha.comissao,
      valor: linha.valor_novo,
    }));
    const { error: linhasErro } = await context.supabase.from("contestacao_vendas_nativas").insert(rows);
    if (linhasErro) throw new Error(linhasErro.message);

    return { total: rows.length };
  });

export const limparRelatorioContestacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z
      .object({
        canal: z.enum(["loja", "pap"]),
        mes_ref: z.string().regex(/^\d{4}-\d{2}$/),
      })
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!(roles ?? []).some((row) => (row.role === "gerente" || row.role === "lider_pap"))) {
      throw new Error("Apenas Gerentes podem limpar o relatório da própria equipe.");
    }

    const mes = `${data.mes_ref}-01`;
    const { data: anteriores, error: buscaErro } = await context.supabase
      .from("contestacao_importacoes")
      .select("id")
      .eq("gerente_id", context.userId)
      .eq("mes_ref", mes)
      .eq("canal", data.canal);
    if (buscaErro) throw new Error(buscaErro.message);

    if (anteriores?.length) {
      const { error } = await context.supabase
        .from("contestacao_importacoes")
        .delete()
        .in("id", anteriores.map((row) => row.id));
      if (error) throw new Error(error.message);
    }

    return { removidos: anteriores?.length ?? 0 };
  });