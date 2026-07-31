ALTER TABLE public.contestacao_importacoes
  ADD COLUMN gerente_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

UPDATE public.contestacao_importacoes
SET gerente_id = criado_por
WHERE gerente_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = contestacao_importacoes.criado_por
      AND ur.role = 'gerente'::public.app_role
  );

CREATE INDEX contestacao_importacoes_gerente_mes_canal_idx
  ON public.contestacao_importacoes (gerente_id, mes_ref, canal);

DROP POLICY IF EXISTS imp_select ON public.contestacao_importacoes;
DROP POLICY IF EXISTS imp_insert ON public.contestacao_importacoes;
DROP POLICY IF EXISTS imp_delete ON public.contestacao_importacoes;
DROP POLICY IF EXISTS cvn_select ON public.contestacao_vendas_nativas;
DROP POLICY IF EXISTS cvn_select_proprio ON public.contestacao_vendas_nativas;
DROP POLICY IF EXISTS cvn_insert ON public.contestacao_vendas_nativas;
DROP POLICY IF EXISTS cvn_delete ON public.contestacao_vendas_nativas;

CREATE POLICY imp_select_team_reports
ON public.contestacao_importacoes FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'regional'::public.app_role)
  OR gerente_id = auth.uid()
  OR gerente_id = (SELECT p.gerente_id FROM public.profiles p WHERE p.id = auth.uid())
);

CREATE POLICY imp_insert_manager_report
ON public.contestacao_importacoes FOR INSERT TO authenticated
WITH CHECK (
  criado_por = auth.uid()
  AND gerente_id = auth.uid()
  AND public.has_role(auth.uid(), 'gerente'::public.app_role)
);

CREATE POLICY imp_delete_manager_report
ON public.contestacao_importacoes FOR DELETE TO authenticated
USING (
  (gerente_id = auth.uid() AND public.has_role(auth.uid(), 'gerente'::public.app_role))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'regional'::public.app_role)
);

CREATE POLICY cvn_select_scoped_report
ON public.contestacao_vendas_nativas FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.contestacao_importacoes ci
    WHERE ci.id = contestacao_vendas_nativas.importacao_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'regional'::public.app_role)
        OR ci.gerente_id = auth.uid()
        OR (
          ci.gerente_id = (SELECT p.gerente_id FROM public.profiles p WHERE p.id = auth.uid())
          AND public.consultor_ve_nativa(contestacao_vendas_nativas.consultor_nome)
        )
      )
  )
);

CREATE POLICY cvn_insert_manager_report
ON public.contestacao_vendas_nativas FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.contestacao_importacoes ci
    WHERE ci.id = contestacao_vendas_nativas.importacao_id
      AND ci.gerente_id = auth.uid()
      AND public.has_role(auth.uid(), 'gerente'::public.app_role)
  )
);

CREATE POLICY cvn_delete_manager_report
ON public.contestacao_vendas_nativas FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.contestacao_importacoes ci
    WHERE ci.id = contestacao_vendas_nativas.importacao_id
      AND (
        (ci.gerente_id = auth.uid() AND public.has_role(auth.uid(), 'gerente'::public.app_role))
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'regional'::public.app_role)
      )
  )
);