import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Campos mensais que a IA pode preencher a partir da planilha. */
export const CAMPOS_ESTRATEGICOS = [
  "vendas",
  "meta_vendas",
  "quebra_venda",
  "vendas_brutas",
  "ativacoes",
  "meta_ativacoes",
  "acessos_anatel",
  "cancel_voluntario",
  "cancel_involuntario",
  "market_share",
  "churn_geral",
  "ativacoes_liquidas",
  "net_ads",
  "portas_ocupadas",
  "mv_linhas_vendidas",
  "mv_meta_vendidas",
  "mv_linhas_ativadas",
  "mv_meta_ativadas",
  "mv_acessos_anatel",
  "mv_cancel_voluntario",
  "mv_cancel_involuntario",
  "mv_market_share",
  "mv_churn_geral",
  "mv_ativacoes_liquidas",
  "mv_net_ads",
  "ignorar",
] as const;

const input = z.object({
  blocos: z
    .array(
      z.object({
        id: z.number().int(),
        aba: z.string().max(120),
        titulo: z.string().max(200),
      }),
    )
    .min(1)
    .max(120),
});

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["mapa"],
  properties: {
    mapa: {
      type: "array",
      description: "Um item por bloco recebido, na mesma ordem.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "campo"],
        properties: {
          id: { type: "number", description: "Id do bloco recebido." },
          campo: { type: "string", enum: [...CAMPOS_ESTRATEGICOS] },
        },
      },
    },
  },
};

/** Usa IA para identificar a qual indicador do sistema cada bloco da planilha corresponde. */
export const mapearBlocosEstrategicos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente.");

    const instrucao = `Você recebe os títulos dos blocos de indicadores de uma planilha de análise sistemática (Banda Larga e Móvel) de um provedor de telecom.

Para cada bloco, escolha o campo do sistema correspondente:
BANDA LARGA (aba de Banda Larga/Fibra):
- portas_ocupadas (portas ocupadas — no bloco "Indicadores de Portas", coluna "Ocupadas"), vendas, meta_vendas, quebra_venda (quebra de venda), vendas_brutas, ativacoes, meta_ativacoes, acessos_anatel, cancel_voluntario, cancel_involuntario, churn_geral (Churn Geral), ativacoes_liquidas (Ativações Líquidas), net_ads (Net Ads / variação de acesso Anatel), market_share.
MÓVEL (aba de Móvel):
- mv_linhas_vendidas (Linhas Vendidas BOSS), mv_meta_vendidas, mv_linhas_ativadas (Linhas Ativadas BOSS), mv_meta_ativadas, mv_acessos_anatel (Acessos Anatel - Unifique), mv_cancel_voluntario (Linhas Canceladas - Voluntário), mv_cancel_involuntario, mv_churn_geral (Churn - Geral), mv_ativacoes_liquidas (Ativações Líquidas), mv_net_ads (Net Ads), mv_market_share.
- "ignorar" para blocos calculados ou irrelevantes: percentuais de atingimento (% de Vendas, % de Ativações, Atingimento de Meta), % Churn Voluntário/Involuntário, portas Total/Livres/% Ocupação, ERBs, data de lançamento 5G, Pós-Pago (BTV/Falcon), Acessos Anatel - MVNO e qualquer outro que não seja um dos campos acima.

Use o nome da aba para decidir entre Banda Larga e Móvel. Responda um item por bloco, na mesma ordem.

Blocos:
${data.blocos.map((b) => `${b.id} | aba "${b.aba}" | "${b.titulo}"`).join("\n")}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [{ role: "user", content: instrucao }],
        response_format: {
          type: "json_schema",
          json_schema: { name: "mapa_blocos", strict: true, schema: SCHEMA },
        },
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      if (res.status === 429)
        throw new Error("Limite de requisições da IA atingido. Tente novamente em instantes.");
      if (res.status === 402)
        throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      throw new Error(`Falha na IA (${res.status}): ${t.slice(0, 300)}`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "";
    if (!raw.trim()) throw new Error("A IA não conseguiu interpretar a planilha.");
    const parsed = JSON.parse(raw) as { mapa?: Array<{ id: number; campo: string }> };
    return { mapa: parsed.mapa ?? [] };
  });
