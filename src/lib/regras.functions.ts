import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const analisarInput = z.object({
  tipo: z.enum(["loja", "pap"]),
  pdfBase64: z.string().min(50),
  filename: z.string().default("circular.pdf"),
});

const faixaLojaSchema = z.object({
  diff_de: z.number(),
  diff_ate: z.number(),
  faixa_0: z.number(),
  faixa_1: z.number(),
  faixa_2: z.number(),
  faixa_3: z.number(),
});
const metaLojaSchema = z.object({
  faixa: z.number().int().min(1).max(3),
  meta_receita: z.number(),
  meta_renov_movel: z.number(),
});
const faixaPapSchema = z.object({
  faixa: z.number().int(),
  receita_de: z.number(),
  receita_ate: z.number(),
  pct_comissao: z.number(),
  meta_max_cancel: z.number(),
  acelerador_baixo_cancel: z.number(),
  bonus_venda_indireta: z.number(),
});

const propostaSchema = z.object({
  tipo: z.enum(["loja", "pap"]),
  resumo: z.string(),
  faixas_loja: z.array(faixaLojaSchema).optional(),
  metas_loja: z.array(metaLojaSchema).optional(),
  faixas_pap: z.array(faixaPapSchema).optional(),
});
export type PropostaRegras = z.infer<typeof propostaSchema>;

const SCHEMA_LOJA = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "faixas_loja", "metas_loja"],
  properties: {
    resumo: { type: "string", description: "Resumo em pt-BR das regras interpretadas" },
    faixas_loja: {
      type: "array",
      description: "Tabela de comissão por diferença de ticket (novo - antigo). Uma linha por faixa de diff.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["diff_de", "diff_ate", "faixa_0", "faixa_1", "faixa_2", "faixa_3"],
        properties: {
          diff_de: { type: "number" },
          diff_ate: { type: "number" },
          faixa_0: { type: "number" },
          faixa_1: { type: "number" },
          faixa_2: { type: "number" },
          faixa_3: { type: "number" },
        },
      },
    },
    metas_loja: {
      type: "array",
      description: "Metas de receita e % de renovações com móvel para atingir cada faixa efetiva (1 a 3).",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["faixa", "meta_receita", "meta_renov_movel"],
        properties: {
          faixa: { type: "integer", minimum: 1, maximum: 3 },
          meta_receita: { type: "number" },
          meta_renov_movel: { type: "number", description: "Percentual como decimal (ex 0.5 = 50%)" },
        },
      },
    },
  },
};

const SCHEMA_PAP = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "faixas_pap"],
  properties: {
    resumo: { type: "string" },
    faixas_pap: {
      type: "array",
      description: "Tabela de comissão PAP por faixa de receita de ativação.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "faixa",
          "receita_de",
          "receita_ate",
          "pct_comissao",
          "meta_max_cancel",
          "acelerador_baixo_cancel",
          "bonus_venda_indireta",
        ],
        properties: {
          faixa: { type: "integer" },
          receita_de: { type: "number" },
          receita_ate: { type: "number" },
          pct_comissao: { type: "number", description: "Percentual como decimal (ex 0.15 = 15%)" },
          meta_max_cancel: { type: "number" },
          acelerador_baixo_cancel: { type: "number" },
          bonus_venda_indireta: { type: "number" },
        },
      },
    },
  },
};

export const analisarCircular = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => analisarInput.parse(d))
  .handler(async ({ data, context }) => {
    // role check
    const { data: rolesRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (rolesRows ?? []).map((r) => r.role);
    if (!roles.some((r) => r === "gerente" || r === "regional" || r === "admin")) {
      throw new Error("Apenas gestores podem analisar circulares.");
    }

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente.");

    const isLoja = data.tipo === "loja";
    const schema = isLoja ? SCHEMA_LOJA : SCHEMA_PAP;
    const instrucao = isLoja
      ? `Você recebe a Circular de Comissionamento de LOJA da Unifique. Extraia:
- A tabela de comissão por diferença de ticket (Valor Novo - Valor Antigo) com 4 colunas de faixa efetiva (0,1,2,3), em Reais por protocolo.
- As metas para atingir cada faixa efetiva (1, 2 e 3): meta de receita mensal (R$) e meta de renovações com móvel (percentual decimal).
Retorne números puros (sem "R$" ou "%"). Percentuais como decimais.`
      : `Você recebe a Circular de Comissionamento de PAP da Unifique. Extraia a tabela de faixas de receita de ativação com percentual de comissão, meta máxima de cancelamento, acelerador para baixo cancelamento e bônus de venda indireta. Percentuais como decimais.`;

    const body = {
      model: "google/gemini-2.5-pro",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instrucao },
            {
              type: "file",
              file: {
                filename: data.filename,
                file_data: `data:application/pdf;base64,${data.pdfBase64}`,
              },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "regras", strict: true, schema },
      },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      if (res.status === 429) throw new Error("Limite de requisições da IA atingido. Tente novamente em instantes.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      throw new Error(`Falha na IA (${res.status}): ${t.slice(0, 300)}`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("A IA retornou uma resposta inválida.");
    }
    const shaped = { tipo: data.tipo, ...(parsed as object) };
    return propostaSchema.parse(shaped);
  });

const aplicarInput = z.object({
  proposta: propostaSchema,
});

export const aplicarRegras = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => aplicarInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rolesRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (rolesRows ?? []).map((r) => r.role);
    if (!roles.some((r) => r === "gerente" || r === "regional" || r === "admin")) {
      throw new Error("Apenas gestores podem aplicar regras.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { proposta } = data;

    if (proposta.tipo === "loja") {
      if (!proposta.faixas_loja?.length || !proposta.metas_loja?.length) {
        throw new Error("Proposta Loja incompleta.");
      }
      const del1 = await supabaseAdmin.from("parametros_loja_faixas_ticket").delete().gte("id", 0);
      if (del1.error) throw new Error(del1.error.message);
      const ins1 = await supabaseAdmin.from("parametros_loja_faixas_ticket").insert(proposta.faixas_loja);
      if (ins1.error) throw new Error(ins1.error.message);
      const del2 = await supabaseAdmin.from("parametros_loja_metas").delete().gte("faixa", 0);
      if (del2.error) throw new Error(del2.error.message);
      const ins2 = await supabaseAdmin.from("parametros_loja_metas").insert(proposta.metas_loja);
      if (ins2.error) throw new Error(ins2.error.message);
      return { ok: true, atualizadas: proposta.faixas_loja.length + proposta.metas_loja.length };
    } else {
      if (!proposta.faixas_pap?.length) throw new Error("Proposta PAP incompleta.");
      const del = await supabaseAdmin.from("parametros_pap_faixas").delete().gte("id", 0);
      if (del.error) throw new Error(del.error.message);
      const ins = await supabaseAdmin
        .from("parametros_pap_faixas")
        .insert(proposta.faixas_pap.map((r) => ({ ...r })));
      if (ins.error) throw new Error(ins.error.message);
      return { ok: true, atualizadas: proposta.faixas_pap.length };
    }
  });
