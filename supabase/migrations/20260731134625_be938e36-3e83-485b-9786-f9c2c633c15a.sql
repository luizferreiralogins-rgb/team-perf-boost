ALTER TABLE public.contestacao_vendas_nativas
  ADD COLUMN IF NOT EXISTS classe_protocolo text,
  ADD COLUMN IF NOT EXISTS tecnologia text,
  ADD COLUMN IF NOT EXISTS valor_novo numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_antigo numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS diferenca numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS faixa numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comissao numeric NOT NULL DEFAULT 0;

DROP POLICY IF EXISTS cvn_insert ON public.contestacao_vendas_nativas;
CREATE POLICY cvn_insert ON public.contestacao_vendas_nativas
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'regional'::public.app_role)
    OR public.has_role(auth.uid(),'admin'::public.app_role)
  );

DROP POLICY IF EXISTS cvn_delete ON public.contestacao_vendas_nativas;
CREATE POLICY cvn_delete ON public.contestacao_vendas_nativas
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(),'regional'::public.app_role)
    OR public.has_role(auth.uid(),'admin'::public.app_role)
  );

DROP POLICY IF EXISTS imp_insert ON public.contestacao_importacoes;
CREATE POLICY imp_insert ON public.contestacao_importacoes
  FOR INSERT TO authenticated WITH CHECK (
    criado_por = auth.uid() AND (
      public.has_role(auth.uid(),'regional'::public.app_role)
      OR public.has_role(auth.uid(),'admin'::public.app_role)
    )
  );

DROP POLICY IF EXISTS imp_delete ON public.contestacao_importacoes;
CREATE POLICY imp_delete ON public.contestacao_importacoes
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(),'regional'::public.app_role)
    OR public.has_role(auth.uid(),'admin'::public.app_role)
  );