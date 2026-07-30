-- Lista de usuários ativos (apenas id e nome) para atribuição de tarefas entre quaisquer usuários
CREATE OR REPLACE FUNCTION public.listar_usuarios_tarefas()
RETURNS TABLE(id uuid, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome
  FROM public.profiles p
  WHERE p.ativo AND auth.uid() IS NOT NULL
  ORDER BY p.nome
$$;

REVOKE ALL ON FUNCTION public.listar_usuarios_tarefas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_usuarios_tarefas() TO authenticated;

-- Garante que qualquer usuário possa criar tarefa para qualquer outro usuário
DROP POLICY IF EXISTS tarefas_insert ON public.tarefas;
CREATE POLICY tarefas_insert ON public.tarefas
FOR INSERT TO authenticated
WITH CHECK (criador_id = auth.uid());
