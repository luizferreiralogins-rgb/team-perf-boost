export const normalizarProsp = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

function dataPlanilha(v: unknown, soData = false): string | null {
  if (v == null || v === "") return null;
  let d: Date;
  if (v instanceof Date) d = v;
  else if (typeof v === "number") d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
  else {
    const texto = String(v).trim();
    const br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
    d = new Date(br ? `${br[3]}-${br[2]}-${br[1]}T${br[4] ?? "00"}:${br[5] ?? "00"}:00` : texto);
  }
  if (Number.isNaN(d.getTime())) throw new Error(`Data inválida na planilha: ${String(v)}`);
  if (soData) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return d.toISOString();
}

export function lerProspecto(linha: Record<string, unknown>, status: { chave: string; nome: string }[]) {
  const campos = new Map(Object.entries(linha).map(([k, v]) => [normalizarProsp(k), v]));
  const pega = (...ks: string[]) => ks.map((k) => campos.get(k)).find((v) => v != null && v !== "");
  const txt = (...ks: string[]) => { const v = pega(...ks); return v == null ? null : String(v).trim() || null; };
  const nome = txt("nome afetado", "nome", "cliente", "nome do cliente");
  if (!nome) return null;
  const valorStatus = txt("status");
  const opcao = status.find((s) => normalizarProsp(s.chave) === normalizarProsp(valorStatus) || normalizarProsp(s.nome) === normalizarProsp(valorStatus) || (s.chave === "fechado" && normalizarProsp(valorStatus) === "fechado"));
  if (valorStatus && !opcao) throw new Error(`Status desconhecido: ${valorStatus}`);
  return {
    consultor_planilha: txt("consultor"), nome_cliente: nome,
    data_contato: dataPlanilha(pega("data contato", "data do contato"), true),
    status: opcao?.chave ?? null, protocolo: txt("protocolo"),
    data_registro: dataPlanilha(pega("data registro", "data de registro", "data")),
    categoria: txt("categoria"), unidade: txt("cidade", "unidade operacional"),
    plano: txt("plano"), observacao: txt("observacao", "obs"),
    cpf_cnpj: txt("cpf/cnpj", "cpf", "cnpj"), telefone: txt("telefone", "contato", "whatsapp"),
  };
}

export function consultorDaPlanilha(nome: unknown, equipe: { id: string; nome: string }[]) {
  const matches = equipe.filter((p) => normalizarProsp(p.nome) === normalizarProsp(nome));
  if (matches.length !== 1) throw new Error(`Consultor não encontrado ou ambíguo na equipe: ${String(nome ?? "")}`);
  return matches[0].id;
}

export const preservarProspectoAtual = (status: string | null) => ["contato_feito", "negociando", "fechado"].includes(status ?? "");