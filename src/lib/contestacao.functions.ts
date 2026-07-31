import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const input = z.object({
  canal: z.enum(["loja", "pap"]),
  mes_ref: z.string().regex(/^\d{4}-\d{2}$/),
  arquivo_nome: z.string().min(1).max(200),
  csv: z.string().min(10).max(400000),
});

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["vendas"],
  properties: {
    vendas: {
      type: "array",
      description: "Uma linha por venda reconhecida no relatório matriz.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "protocolo",
          "nome_cliente",
          "cpf_cnpj",
          "consultor_nome",
          "classe_protocolo",
          "tecnologia",
          "valor_novo",
          "valor_antigo",
          "diferenca",
          "faixa",
          "comissao",
          "valor",
          "data_instalacao",
        ],
        properties: {
          protocolo: { type: "string", description: "Número do protocolo/contrato. Vazio se não houver." },
          nome_cliente: { type: "string" },
          cpf_cnpj: { type: "string", description: "Somente dígitos, ou vazio." },
          consultor_nome: { type: "string", description: "Nome do vendedor/consultor, ou vazio." },
          classe_protocolo: { type: "string", description: "Classe do protocolo, ou vazio." },
          tecnologia: { type: "string", description: "Tecnologia/produto, ou vazio." },
          valor_novo: { type: "number", description: "Preço novo em reais. 0 se não houver." },
          valor_antigo: { type: "number", description: "Preço antigo em reais. 0 se não houver." },
          diferenca: { type: "number", description: "Diferença entre preço novo e antigo. 0 se não houver." },
          faixa: { type: "number", description: "Faixa aplicada (número). 0 se não houver." },
          comissao: { type: "number", description: "Comissão em reais. 0 se não houver." },
          valor: { type: "number", description: "Valor mensal da venda em reais (use o preço novo). 0 se não houver." },
          data_instalacao: {
            type: "string",
            description: "Data de instalação/ativação em formato AAAA-MM-DD. Vazio se não houver.",
          },
        },
      },
    },
  },
};

export type VendaNativa = {
  protocolo: string;
  nome_cliente: string;
  cpf_cnpj: string;
  consultor_nome: string;
  classe_protocolo: string;
  tecnologia: string;
  valor_novo: number;
  valor_antigo: number;
  diferenca: number;
  faixa: number;
  comissao: number;
  valor: number;
  data_instalacao: string;
};


/** Interpreta a planilha do sistema nativo (convertida em CSV) e grava as vendas reconhecidas. */
export const importarPlanilhaNativa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rolesRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (rolesRows ?? []).map((r) => r.role);
    if (!roles.some((r) => r === "gerente" || r === "regional" || r === "admin")) {
      throw new Error("Apenas gestores podem importar a planilha do sistema nativo.");
    }

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente.");

    const instrucao = `Você recebe o conteúdo (em CSV) de uma planilha exportada do sistema nativo da Unifique com as vendas reconhecidas do canal ${data.canal.toUpperCase()} no mês ${data.mes_ref}.

Sua tarefa: identificar automaticamente qual coluna corresponde a cada campo (os nomes das colunas variam: "Protocolo", "Contrato", "Nº OS", "Cliente", "Nome do Cliente", "CPF/CNPJ", "Vendedor", "Consultor", "Valor", "Mensalidade", "Data Instalação", "Ativação", etc.) e devolver UMA linha por venda.

Regras:
- Ignore linhas de cabeçalho, totais, subtotais e linhas em branco;
- Converta valores no padrão brasileiro (1.234,56 => 1234.56) e remova "R$";
- Converta datas para AAAA-MM-DD (30/07/2026 => 2026-07-30);
- CPF/CNPJ apenas com dígitos;
- Nunca invente vendas: extraia apenas o que existe no arquivo;
- Se um campo não existir na planilha, devolva string vazia (ou 0 para valor).

Conteúdo do arquivo "${data.arquivo_nome}":
${data.csv.slice(0, 380000)}`;

    const chamar = async (model: string) => {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: instrucao }],
          response_format: {
            type: "json_schema",
            json_schema: { name: "vendas_nativas", strict: true, schema: SCHEMA },
          },
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        if (res.status === 429)
          throw new Error("Limite de requisições da IA atingido. Tente novamente em instantes.");
        if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
        throw new Error(`Falha na IA (${res.status}): ${t.slice(0, 300)}`);
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = json.choices?.[0]?.message?.content ?? "";
      if (!raw.trim()) throw new Error("A IA não conseguiu ler a planilha enviada.");
      const parsed = JSON.parse(raw) as { vendas?: VendaNativa[] };
      return (parsed.vendas ?? []).filter((v) => (v.nome_cliente ?? "").trim() || (v.protocolo ?? "").trim());
    };

    let vendas: VendaNativa[];
    try {
      vendas = await chamar("google/gemini-3.6-flash");
    } catch (e) {
      try {
        vendas = await chamar("google/gemini-3.1-pro-preview");
      } catch {
        throw e instanceof Error ? e : new Error("Falha ao interpretar a planilha.");
      }
    }

    if (!vendas.length) throw new Error("Nenhuma venda foi identificada na planilha.");

    const mes = `${data.mes_ref}-01`;

    // Substitui a importação anterior do mesmo mês/canal.
    const { data: antigas } = await context.supabase
      .from("contestacao_importacoes")
      .select("id")
      .eq("mes_ref", mes)
      .eq("canal", data.canal);
    if (antigas?.length) {
      await context.supabase
        .from("contestacao_importacoes")
        .delete()
        .in("id", antigas.map((a) => a.id));
    }

    const { data: imp, error: impErr } = await context.supabase
      .from("contestacao_importacoes")
      .insert({
        mes_ref: mes,
        canal: data.canal,
        arquivo_nome: data.arquivo_nome,
        total_linhas: vendas.length,
        criado_por: context.userId,
      })
      .select("id")
      .single();
    if (impErr || !imp) throw new Error(impErr?.message ?? "Falha ao registrar importação.");

    const rows = vendas.slice(0, 5000).map((v) => ({
      importacao_id: imp.id,
      mes_ref: mes,
      canal: data.canal,
      protocolo: (v.protocolo ?? "").trim() || null,
      nome_cliente: (v.nome_cliente ?? "").trim() || "(sem nome)",
      cpf_cnpj: (v.cpf_cnpj ?? "").replace(/\D/g, "") || null,
      consultor_nome: (v.consultor_nome ?? "").trim() || null,
      valor: Number(v.valor) || 0,
      data_instalacao: /^\d{4}-\d{2}-\d{2}$/.test(v.data_instalacao ?? "") ? v.data_instalacao : null,
    }));

    const { error: insErr } = await context.supabase.from("contestacao_vendas_nativas").insert(rows);
    if (insErr) throw new Error(insErr.message);

    return { importacao_id: imp.id, total: rows.length };
  });
