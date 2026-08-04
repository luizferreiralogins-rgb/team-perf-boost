CREATE TABLE public.tarefa_participantes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tarefa_id uuid NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status public.tarefa_status NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tarefa_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarefa_participantes TO authenticated;
GRANT ALL ON public.tarefa_participantes TO service_role;

ALTER TABLE public.tarefa_participantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver participantes"
ON public.tarefa_participantes FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = tarefa_id AND t.criador_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.tarefa_participantes p2 WHERE p2.tarefa_id = tarefa_participantes.tarefa_id AND p2.user_id = auth.uid())
);

CREATE POLICY "criador adiciona participantes"
ON public.tarefa_participantes FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = tarefa_id AND t.criador_id = auth.uid())
);

CREATE POLICY "atualizar fase"
ON public.tarefa_participantes FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = tarefa_id AND t.criador_id = auth.uid())
)
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = tarefa_id AND t.criador_id = auth.uid())
);

CREATE POLICY "criador remove participantes"
ON public.tarefa_participantes FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = tarefa_id AND t.criador_id = auth.uid())
);

CREATE TRIGGER tarefa_participantes_set_updated_at
BEFORE UPDATE ON public.tarefa_participantes
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Consolida tarefas duplicadas (mesma tarefa criada para várias pessoas)
WITH grupos AS (
  SELECT id, criador_id, titulo, coalesce(descricao,'') d, data_venc, coalesce(hora_venc,'00:00') h,
         responsavel_id, status,
         first_value(id) OVER (PARTITION BY criador_id, titulo, coalesce(descricao,''), data_venc, coalesce(hora_venc,'00:00') ORDER BY created_at, id) AS principal
  FROM public.tarefas
)
INSERT INTO public.tarefa_participantes (tarefa_id, user_id, status)
SELECT principal, responsavel_id, status
FROM grupos
WHERE responsavel_id IS NOT NULL
ON CONFLICT (tarefa_id, user_id) DO NOTHING;

WITH grupos AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY criador_id, titulo, coalesce(descricao,''), data_venc, coalesce(hora_venc,'00:00') ORDER BY created_at, id) AS principal
  FROM public.tarefas
)
DELETE FROM public.tarefas WHERE id IN (SELECT id FROM grupos WHERE id <> principal);