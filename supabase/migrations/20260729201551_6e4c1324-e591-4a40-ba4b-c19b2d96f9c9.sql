CREATE TYPE public.tarefa_status AS ENUM ('pendente','concluida','cancelada');
CREATE TYPE public.tarefa_prioridade AS ENUM ('baixa','media','alta');
CREATE TYPE public.tarefa_alvo AS ENUM ('propria','usuario','cliente');

CREATE TABLE public.tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criador_id uuid NOT NULL,
  responsavel_id uuid,
  alvo public.tarefa_alvo NOT NULL DEFAULT 'propria',
  cliente_nome text,
  cliente_contato text,
  titulo text NOT NULL,
  descricao text,
  data_venc date NOT NULL DEFAULT CURRENT_DATE,
  hora_venc time,
  prioridade public.tarefa_prioridade NOT NULL DEFAULT 'media',
  status public.tarefa_status NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarefas TO authenticated;
GRANT ALL ON public.tarefas TO service_role;

ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;

CREATE POLICY tarefas_read ON public.tarefas FOR SELECT TO authenticated
USING (
  criador_id = auth.uid()
  OR responsavel_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'regional')
  OR (public.has_role(auth.uid(), 'gerente') AND (public.is_gestor_de(auth.uid(), criador_id) OR (responsavel_id IS NOT NULL AND public.is_gestor_de(auth.uid(), responsavel_id))))
);

CREATE POLICY tarefas_insert ON public.tarefas FOR INSERT TO authenticated
WITH CHECK (criador_id = auth.uid());

CREATE POLICY tarefas_update ON public.tarefas FOR UPDATE TO authenticated
USING (criador_id = auth.uid() OR responsavel_id = auth.uid())
WITH CHECK (criador_id = auth.uid() OR responsavel_id = auth.uid());

CREATE POLICY tarefas_delete ON public.tarefas FOR DELETE TO authenticated
USING (criador_id = auth.uid());

CREATE INDEX tarefas_data_idx ON public.tarefas (data_venc);
CREATE INDEX tarefas_resp_idx ON public.tarefas (responsavel_id);

CREATE TRIGGER tarefas_set_updated_at BEFORE UPDATE ON public.tarefas
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();