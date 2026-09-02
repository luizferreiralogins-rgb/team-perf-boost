DROP POLICY IF EXISTS estr_cidades_read ON public.estrategico_cidades;
CREATE POLICY estr_cidades_read ON public.estrategico_cidades FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR public.is_gestor_regras(auth.uid()) OR public.is_gestor_de(auth.uid(), owner_id));

DROP POLICY IF EXISTS estr_mensal_read ON public.estrategico_mensal;
CREATE POLICY estr_mensal_read ON public.estrategico_mensal FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.estrategico_cidades c WHERE c.id = estrategico_mensal.cidade_id AND (c.owner_id = auth.uid() OR public.is_gestor_regras(auth.uid()) OR public.is_gestor_de(auth.uid(), c.owner_id))));