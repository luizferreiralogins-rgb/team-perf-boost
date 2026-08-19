CREATE OR REPLACE FUNCTION public.aniversariantes_hoje()
RETURNS TABLE(id uuid, nome text, sou_eu boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH me AS (SELECT p.id, p.gerente_id FROM public.profiles p WHERE p.id = auth.uid())
  SELECT DISTINCT p.id, p.nome, (p.id = auth.uid()) AS sou_eu
  FROM public.profiles p, me
  WHERE auth.uid() IS NOT NULL
    AND p.ativo
    AND p.data_nascimento IS NOT NULL
    AND to_char(p.data_nascimento, 'MM-DD') =
        to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'MM-DD')
    AND (
      p.id = me.id
      OR (me.gerente_id IS NOT NULL AND p.gerente_id = me.gerente_id)
      OR p.gerente_id = me.id
      OR public.is_gestor_de(me.id, p.id)
    )
  ORDER BY 2;
$$;

GRANT EXECUTE ON FUNCTION public.aniversariantes_hoje() TO authenticated;