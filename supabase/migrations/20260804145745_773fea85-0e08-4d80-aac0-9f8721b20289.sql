CREATE OR REPLACE FUNCTION public.pode_ver_tarefa(_user_id uuid, _tarefa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tarefas t
    WHERE t.id = _tarefa_id
      AND (
        t.criador_id = _user_id
        OR t.responsavel_id = _user_id
        OR EXISTS (
          SELECT 1
          FROM public.tarefa_participantes tp
          WHERE tp.tarefa_id = t.id
            AND tp.user_id = _user_id
        )
        OR public.has_role(_user_id, 'admin'::public.app_role)
        OR public.has_role(_user_id, 'regional'::public.app_role)
        OR (
          public.has_role(_user_id, 'gerente'::public.app_role)
          AND (
            public.is_gestor_de(_user_id, t.criador_id)
            OR (t.responsavel_id IS NOT NULL AND public.is_gestor_de(_user_id, t.responsavel_id))
          )
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.pode_ver_tarefa(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pode_ver_tarefa(uuid, uuid) TO service_role;

DROP POLICY IF EXISTS "ver participantes" ON public.tarefa_participantes;
CREATE POLICY "ver participantes"
ON public.tarefa_participantes
FOR SELECT
TO authenticated
USING (public.pode_ver_tarefa(auth.uid(), tarefa_id));

DROP POLICY IF EXISTS "tarefas_read" ON public.tarefas;
CREATE POLICY "tarefas_read"
ON public.tarefas
FOR SELECT
TO authenticated
USING (public.pode_ver_tarefa(auth.uid(), id));

DROP POLICY IF EXISTS "tarefas_update" ON public.tarefas;
CREATE POLICY "tarefas_update"
ON public.tarefas
FOR UPDATE
TO authenticated
USING (public.pode_ver_tarefa(auth.uid(), id))
WITH CHECK (public.pode_ver_tarefa(auth.uid(), id));