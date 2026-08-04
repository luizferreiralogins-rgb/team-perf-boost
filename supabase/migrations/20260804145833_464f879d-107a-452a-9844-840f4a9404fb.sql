REVOKE ALL ON FUNCTION public.pode_ver_tarefa(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pode_ver_tarefa(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pode_ver_tarefa(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_consolidar_fases_tarefa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tarefa public.tarefas;
  v_todos_concluidos boolean;
  v_algum_andamento boolean;
  v_proxima_data date;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_tarefa
  FROM public.tarefas
  WHERE id = NEW.tarefa_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT
    bool_and(status = 'concluida'::public.tarefa_status),
    bool_or(status <> 'pendente'::public.tarefa_status)
  INTO v_todos_concluidos, v_algum_andamento
  FROM public.tarefa_participantes
  WHERE tarefa_id = NEW.tarefa_id;

  IF v_todos_concluidos THEN
    v_proxima_data := CASE v_tarefa.recorrencia
      WHEN 'diaria' THEN v_tarefa.data_venc + 1
      WHEN 'semanal' THEN v_tarefa.data_venc + 7
      WHEN 'quinzenal' THEN v_tarefa.data_venc + 14
      WHEN 'mensal' THEN (v_tarefa.data_venc + interval '1 month')::date
      ELSE NULL
    END;

    IF v_proxima_data IS NOT NULL THEN
      UPDATE public.tarefas
      SET status = 'pendente'::public.tarefa_status,
          data_venc = v_proxima_data
      WHERE id = NEW.tarefa_id;

      UPDATE public.tarefa_participantes
      SET status = 'pendente'::public.tarefa_status
      WHERE tarefa_id = NEW.tarefa_id;
    ELSE
      UPDATE public.tarefas
      SET status = 'concluida'::public.tarefa_status
      WHERE id = NEW.tarefa_id;
    END IF;
  ELSE
    UPDATE public.tarefas
    SET status = CASE
      WHEN v_algum_andamento THEN 'iniciada'::public.tarefa_status
      ELSE 'pendente'::public.tarefa_status
    END
    WHERE id = NEW.tarefa_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tarefa_participantes_consolidar_fases ON public.tarefa_participantes;
CREATE TRIGGER tarefa_participantes_consolidar_fases
AFTER UPDATE OF status ON public.tarefa_participantes
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.tg_consolidar_fases_tarefa();

DROP POLICY IF EXISTS "tarefas_update" ON public.tarefas;
CREATE POLICY "tarefas_update"
ON public.tarefas
FOR UPDATE
TO authenticated
USING (criador_id = auth.uid())
WITH CHECK (criador_id = auth.uid());