DROP POLICY IF EXISTS tarefas_read ON public.tarefas;
CREATE POLICY tarefas_read
ON public.tarefas
FOR SELECT
TO authenticated
USING (
  criador_id = auth.uid()
  OR public.pode_ver_tarefa(auth.uid(), id)
);