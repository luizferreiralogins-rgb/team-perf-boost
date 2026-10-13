export type AvisoAgenda = {
  id: string;
  titulo: string;
  descricao: string | null;
  cliente_nome: string | null;
  prioridade: string;
  agendado_em: string;
  agora: string;
};

export function avisosVencidos(avisos: AvisoAgenda[], agora: number) {
  return avisos.filter((aviso) => Date.parse(aviso.agendado_em) <= agora);
}