import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Content } from '@radix-ui/react-alert-dialog';
import { BellRing, CalendarClock, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { avisosVencidos } from '@/lib/avisos-agenda';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogPortal, AlertDialogOverlay, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
} from '@/components/ui/alert-dialog';

export function AvisoAgenda({ uid }: { uid?: string }) {
  const qc = useQueryClient();
  const [agora, setAgora] = useState(0);
  const avisos = useQuery({
    queryKey: ['avisos-agenda', uid],
    enabled: Boolean(uid),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('listar_avisos_tarefas');
      if (error) throw error;
      return { itens: data ?? [], recebido: performance.now() };
    },
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: 'always',
  });

  useEffect(() => {
    const atualizar = () => {
      const dados = avisos.data;
      const horaServidor = dados?.itens[0]?.agora;
      setAgora(horaServidor && dados
        ? Date.parse(horaServidor) + performance.now() - dados.recebido
        : 0);
    };
    atualizar();
    const timer = window.setInterval(atualizar, 500);
    return () => window.clearInterval(timer);
  }, [avisos.data]);

  const pendentes = avisosVencidos(avisos.data?.itens ?? [], agora);
  const atual = pendentes[0];
  const confirmar = useMutation({
    mutationFn: async () => {
      if (!atual) return;
      const { error } = await supabase.rpc('confirmar_leitura_tarefa', {
        _tarefa_id: atual.id, _agendado_em: atual.agendado_em,
      });
      if (error) throw error;
      return atual;
    },
    onSuccess: (lido) => {
      if (!lido) return;
      qc.setQueryData<typeof avisos.data>(['avisos-agenda', uid], (dados) => dados ? {
        ...dados, itens: dados.itens.filter((a) => a.id !== lido.id || a.agendado_em !== lido.agendado_em),
      } : dados);
      qc.invalidateQueries({ queryKey: ['avisos-agenda', uid] });
    },
  });

  if (!uid || !atual) return null;

  return (
    <AlertDialog open>
      <AlertDialogPortal>
        <AlertDialogOverlay className="z-[100] bg-foreground/60 backdrop-blur-sm" />
        <Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-[101] grid max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-lg border border-border bg-background p-6 text-foreground shadow-lg"
        >
          <AlertDialogHeader>
            <BellRing className="mb-2 h-8 w-8 text-primary" />
            <p className="text-sm font-medium text-primary">Agenda/Tarefa{pendentes.length > 1 ? ` · ${pendentes.length} avisos pendentes` : ''}</p>
            <AlertDialogTitle className="break-words text-xl">{atual.titulo}</AlertDialogTitle>
            <AlertDialogDescription className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 shrink-0" />
              {new Intl.DateTimeFormat('pt-BR', {
                dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
              }).format(new Date(atual.agendado_em))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {atual.descricao && <p className="whitespace-pre-wrap break-words text-sm">{atual.descricao}</p>}
          {atual.cliente_nome && <p className="break-words text-sm text-muted-foreground">Cliente: {atual.cliente_nome}</p>}
          <p className="text-sm text-muted-foreground">Prioridade: {({ alta: 'Alta', media: 'Média', baixa: 'Baixa' } as Record<string, string>)[atual.prioridade]}</p>
          {confirmar.isError && <p role="alert" className="text-sm text-destructive">Não foi possível confirmar a leitura. Tente novamente.</p>}
          <AlertDialogFooter>
            <Button disabled={confirmar.isPending} onClick={() => confirmar.mutate()}>
              <Check className="mr-2 h-4 w-4" />{confirmar.isPending ? 'Confirmando…' : 'Ok'}
            </Button>
          </AlertDialogFooter>
        </Content>
      </AlertDialogPortal>
    </AlertDialog>
  );
}