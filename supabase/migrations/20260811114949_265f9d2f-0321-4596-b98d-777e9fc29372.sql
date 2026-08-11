DROP POLICY IF EXISTS estr_cidades_read ON public.estrategico_cidades;
CREATE POLICY estr_cidades_read ON public.estrategico_cidades
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'regional')
  OR public.is_gestor_de(auth.uid(), owner_id)
  OR public.is_gestor_de(owner_id, auth.uid())
);