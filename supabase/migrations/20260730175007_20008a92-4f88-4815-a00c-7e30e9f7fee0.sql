-- 1) Funções: remover EXECUTE desnecessário
REVOKE ALL ON FUNCTION public.tg_lead_contato_registrado() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expirar_leads_sem_contato() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expirar_leads_sem_contato() TO authenticated;

-- 2) contestacao_vendas_nativas: somente gestores
DROP POLICY IF EXISTS cvn_select ON public.contestacao_vendas_nativas;
CREATE POLICY cvn_select ON public.contestacao_vendas_nativas
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'regional'::public.app_role)
  OR public.has_role(auth.uid(), 'gerente'::public.app_role)
);

-- 3) contestacao_importacoes: gestores ou criador
DROP POLICY IF EXISTS imp_select ON public.contestacao_importacoes;
CREATE POLICY imp_select ON public.contestacao_importacoes
FOR SELECT TO authenticated
USING (
  criado_por = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'regional'::public.app_role)
  OR public.has_role(auth.uid(), 'gerente'::public.app_role)
);

-- 4) parametros_versoes: somente gestores
DROP POLICY IF EXISTS parametros_versoes_select_auth ON public.parametros_versoes;
CREATE POLICY parametros_versoes_select_auth ON public.parametros_versoes
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'regional'::public.app_role)
  OR public.has_role(auth.uid(), 'gerente'::public.app_role)
);