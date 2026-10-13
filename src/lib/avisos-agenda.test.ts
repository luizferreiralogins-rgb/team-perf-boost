import { describe, expect, it } from 'vitest';
import { avisosVencidos, type AvisoAgenda } from './avisos-agenda';

const aviso: AvisoAgenda = {
  id: 'tarefa', titulo: 'Reunião', descricao: null, cliente_nome: null,
  prioridade: 'media', agendado_em: '2026-10-13T10:00:00-03:00', agora: '2026-10-13T12:59:59Z',
};

describe('Aviso na data e horário programados', () => {
  it('não bloqueia antes do horário', () => {
    expect(avisosVencidos([aviso], Date.parse('2026-10-13T12:59:59Z'))).toEqual([]);
  });
  it('exibe exatamente às 10h de São Paulo', () => {
    expect(avisosVencidos([aviso], Date.parse('2026-10-13T13:00:00Z'))).toEqual([aviso]);
  });
  it('mantém avisos atrasados até a leitura', () => {
    expect(avisosVencidos([aviso], Date.parse('2026-10-14T13:00:00Z'))).toEqual([aviso]);
  });
});