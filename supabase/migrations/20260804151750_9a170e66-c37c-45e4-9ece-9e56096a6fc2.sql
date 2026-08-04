CREATE OR REPLACE FUNCTION public.tg_tarefa_definir_criador()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária para criar tarefa';
  END IF;
  NEW.criador_id := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tarefa_definir_criador ON public.tarefas;
CREATE TRIGGER tarefa_definir_criador
BEFORE INSERT ON public.tarefas
FOR EACH ROW
EXECUTE FUNCTION public.tg_tarefa_definir_criador();