DROP POLICY IF EXISTS estr_cidades_read ON public.estrategico_cidades;
CREATE POLICY estr_cidades_read ON public.estrategico_cidades
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'regional'::public.app_role)
  OR public.is_gestor_de(auth.uid(), owner_id)
);

DROP POLICY IF EXISTS estr_mensal_read ON public.estrategico_mensal;
CREATE POLICY estr_mensal_read ON public.estrategico_mensal
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.estrategico_cidades c
    WHERE c.id = estrategico_mensal.cidade_id
      AND (
        c.owner_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'regional'::public.app_role)
        OR public.is_gestor_de(auth.uid(), c.owner_id)
      )
  )
);

REVOKE EXECUTE ON FUNCTION public.aniversariantes_hoje() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.proximo_aniversariante() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.pode_ver_tarefa(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.ranking_time(date, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.aniversariantes_hoje() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proximo_aniversariante() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pode_ver_tarefa(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ranking_time(date, boolean) TO authenticated, service_role;