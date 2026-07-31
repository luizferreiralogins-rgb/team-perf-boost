DROP POLICY IF EXISTS imp_select_team_reports ON public.contestacao_importacoes;
CREATE POLICY imp_select_team_reports ON public.contestacao_importacoes
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'regional'::app_role)
  OR gerente_id = auth.uid()
  OR (is_gestor_de(gerente_id, auth.uid()) AND NOT has_role(auth.uid(), 'gerente'::app_role))
);

DROP POLICY IF EXISTS cvn_select_scoped_report ON public.contestacao_vendas_nativas;
CREATE POLICY cvn_select_scoped_report ON public.contestacao_vendas_nativas
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.contestacao_importacoes ci
    WHERE ci.id = contestacao_vendas_nativas.importacao_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'regional'::app_role)
        OR ci.gerente_id = auth.uid()
        OR (
          is_gestor_de(ci.gerente_id, auth.uid())
          AND NOT has_role(auth.uid(), 'gerente'::app_role)
          AND consultor_ve_nativa(contestacao_vendas_nativas.consultor_nome)
        )
      )
  )
);