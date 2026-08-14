ALTER TABLE public.estrategico_cidades ADD COLUMN IF NOT EXISTS unidade text NOT NULL DEFAULT '';
ALTER TABLE public.estrategico_cidades ADD COLUMN IF NOT EXISTS regional text NOT NULL DEFAULT '';
ALTER TABLE public.estrategico_mensal ADD COLUMN IF NOT EXISTS mv_linhas_vendidas numeric NOT NULL DEFAULT 0;
ALTER TABLE public.estrategico_mensal ADD COLUMN IF NOT EXISTS mv_meta_vendidas numeric NOT NULL DEFAULT 0;
ALTER TABLE public.estrategico_mensal ADD COLUMN IF NOT EXISTS mv_linhas_ativadas numeric NOT NULL DEFAULT 0;
ALTER TABLE public.estrategico_mensal ADD COLUMN IF NOT EXISTS mv_meta_ativadas numeric NOT NULL DEFAULT 0;
ALTER TABLE public.estrategico_mensal ADD COLUMN IF NOT EXISTS mv_acessos_anatel numeric NOT NULL DEFAULT 0;
ALTER TABLE public.estrategico_mensal ADD COLUMN IF NOT EXISTS mv_cancel_voluntario numeric NOT NULL DEFAULT 0;
ALTER TABLE public.estrategico_mensal ADD COLUMN IF NOT EXISTS mv_cancel_involuntario numeric NOT NULL DEFAULT 0;
ALTER TABLE public.estrategico_mensal ADD COLUMN IF NOT EXISTS mv_market_share numeric NOT NULL DEFAULT 0;

DROP POLICY IF EXISTS estr_cidades_read ON public.estrategico_cidades;
CREATE POLICY estr_cidades_read ON public.estrategico_cidades FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS estr_cidades_update ON public.estrategico_cidades;
CREATE POLICY estr_cidades_update ON public.estrategico_cidades FOR UPDATE TO authenticated USING (public.is_gestor_regras(auth.uid())) WITH CHECK (public.is_gestor_regras(auth.uid()));
DROP POLICY IF EXISTS estr_cidades_delete ON public.estrategico_cidades;
CREATE POLICY estr_cidades_delete ON public.estrategico_cidades FOR DELETE TO authenticated USING (public.is_gestor_regras(auth.uid()));
DROP POLICY IF EXISTS estr_mensal_update ON public.estrategico_mensal;
CREATE POLICY estr_mensal_update ON public.estrategico_mensal FOR UPDATE TO authenticated USING (public.is_gestor_regras(auth.uid())) WITH CHECK (public.is_gestor_regras(auth.uid()));
DROP POLICY IF EXISTS estr_mensal_delete ON public.estrategico_mensal;
CREATE POLICY estr_mensal_delete ON public.estrategico_mensal FOR DELETE TO authenticated USING (public.is_gestor_regras(auth.uid()));

DELETE FROM public.estrategico_cidades;