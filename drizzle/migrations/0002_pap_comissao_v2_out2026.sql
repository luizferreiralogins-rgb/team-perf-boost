CREATE TABLE public.parametros_pap2_faixas_bl (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), faixa smallint NOT NULL, ativ_de integer NOT NULL, ativ_ate integer NOT NULL, pct_comissao numeric NOT NULL DEFAULT 0, bonus_venda_indireta numeric NOT NULL DEFAULT 0);
CREATE TABLE public.parametros_pap2_faixas_demais (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), faixa smallint NOT NULL, receita_de numeric NOT NULL, receita_ate numeric NOT NULL, pct_comissao numeric NOT NULL DEFAULT 0, bonus_venda_indireta numeric NOT NULL DEFAULT 0);
CREATE TABLE public.parametros_pap2_novos_produtos (codigo text PRIMARY KEY, nome text NOT NULL, percentual numeric NOT NULL DEFAULT 0, limitado boolean NOT NULL DEFAULT false, limite numeric NOT NULL DEFAULT 999999999);
CREATE TABLE public.parametros_pap2_acel_churn (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), faixa smallint NOT NULL, churn_de numeric NOT NULL, churn_ate numeric NOT NULL, bonus numeric NOT NULL DEFAULT 0);
CREATE TABLE public.parametros_pap2_acel_razao (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), faixa smallint NOT NULL, razao_de numeric NOT NULL, razao_ate numeric NOT NULL, bonus numeric NOT NULL DEFAULT 0);
DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['parametros_pap2_faixas_bl','parametros_pap2_faixas_demais','parametros_pap2_novos_produtos','parametros_pap2_acel_churn','parametros_pap2_acel_razao'] LOOP
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t||'_read', t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_gestor_regras(auth.uid())) WITH CHECK (public.is_gestor_regras(auth.uid()))', t||'_write', t);
END LOOP; END $$;