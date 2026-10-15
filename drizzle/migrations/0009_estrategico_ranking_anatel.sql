ALTER TABLE public.estrategico_cidades ADD COLUMN IF NOT EXISTS ranking_anatel text, ADD COLUMN IF NOT EXISTS ranking_anatel_movel text;
DROP POLICY IF EXISTS estr_mensal_insert ON public.estrategico_mensal;
CREATE POLICY estr_mensal_insert ON public.estrategico_mensal FOR INSERT TO authenticated WITH CHECK (public.is_gestor_regras(auth.uid()));