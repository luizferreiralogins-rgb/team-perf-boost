import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type Indicador = { nome: string; cpf: string; telefone: string };
export const indicadorVazio: Indicador = { nome: "", cpf: "", telefone: "" };

export const isIndiqueGanhe = (canal: string) => /indique/i.test(canal ?? "");

export function validarIndicador(i: Indicador): string | null {
  if (i.nome.trim().length < 3) return "Informe o nome completo de quem indicou.";
  if (i.cpf.replace(/\D/g, "").length !== 11) return "CPF de quem indicou deve ter 11 números.";
  if (!/^\d{10,11}$/.test(i.telefone.replace(/\D/g, ""))) return "Telefone de quem indicou deve ter DDD + número.";
  return null;
}

/** Garante que a indicação exista em Gestão Indique Ganhe; cria se não houver. */
export async function sincronizarIndicacao(
  i: Indicador,
  venda: { vendedorId: string; nome: string; telefone?: string | null; instalado: boolean },
) {
  const cpf = i.cpf.replace(/\D/g, "");
  const nome = venda.nome.trim();
  const { data } = await supabase
    .from("indicacoes")
    .select("id, indicado_nome")
    .eq("vendedor_id", venda.vendedorId)
    .eq("cliente_cpf", cpf);
  const existe = (data ?? []).some(
    (r) => r.indicado_nome.trim().toLowerCase() === nome.toLowerCase(),
  );
  if (existe) return;
  const agora = new Date().toISOString();
  const status = venda.instalado ? "instalado" : "contratou";
  const { error } = await supabase.from("indicacoes").insert({
    vendedor_id: venda.vendedorId,
    cliente_nome: i.nome.trim(),
    cliente_cpf: cpf,
    cliente_telefone: i.telefone.replace(/\D/g, ""),
    indicado_nome: nome,
    indicado_celular: (venda.telefone ?? "").replace(/\D/g, ""),
    status,
    historico: [{ status, em: agora }],
  });
  if (error) console.error("Indique Ganhe:", error.message);
}

export function CamposIndicador({ value, onChange }: { value: Indicador; onChange: (v: Indicador) => void }) {
  return (
    <div className="md:col-span-2 rounded-md border p-3 space-y-3">
      <p className="text-sm font-medium">Qual cliente indicou?</p>
      <div className="grid gap-3 md:grid-cols-3">
        <div><Label>Nome completo *</Label><Input value={value.nome} maxLength={150} onChange={(e) => onChange({ ...value, nome: e.target.value })} /></div>
        <div><Label>CPF *</Label><Input value={value.cpf} maxLength={14} placeholder="000.000.000-00" onChange={(e) => onChange({ ...value, cpf: e.target.value })} /></div>
        <div><Label>Telefone *</Label><Input type="tel" value={value.telefone} maxLength={20} placeholder="(47) 99999-9999" onChange={(e) => onChange({ ...value, telefone: e.target.value })} /></div>
      </div>
    </div>
  );
}
