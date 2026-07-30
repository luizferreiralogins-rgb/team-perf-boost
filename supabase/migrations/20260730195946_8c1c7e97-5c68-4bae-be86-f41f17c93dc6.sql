CREATE TABLE public.parametros_pap_novos_produtos (
  codigo text PRIMARY KEY,
  nome text NOT NULL,
  percentual numeric NOT NULL DEFAULT 0,
  limitado boolean NOT NULL DEFAULT false,
  limite numeric NOT NULL DEFAULT 999999999
);

GRANT SELECT ON public.parametros_pap_novos_produtos TO authenticated;
GRANT ALL ON public.parametros_pap_novos_produtos TO service_role;
ALTER TABLE public.parametros_pap_novos_produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY pap_np_read ON public.parametros_pap_novos_produtos
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.is_gestor_regras(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid,'admin') OR public.has_role(_uid,'regional') OR public.has_role(_uid,'gerente')
$$;

REVOKE EXECUTE ON FUNCTION public.is_gestor_regras(uuid) FROM anon;

GRANT INSERT, UPDATE, DELETE ON public.parametros_loja_faixas_ticket TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.parametros_loja_metas TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.parametros_loja_novos_produtos TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.parametros_pap_faixas TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.parametros_pap_novos_produtos TO authenticated;

CREATE POLICY loja_faixas_write ON public.parametros_loja_faixas_ticket
  FOR ALL TO authenticated USING (public.is_gestor_regras(auth.uid())) WITH CHECK (public.is_gestor_regras(auth.uid()));
CREATE POLICY loja_metas_write ON public.parametros_loja_metas
  FOR ALL TO authenticated USING (public.is_gestor_regras(auth.uid())) WITH CHECK (public.is_gestor_regras(auth.uid()));
CREATE POLICY loja_np_write ON public.parametros_loja_novos_produtos
  FOR ALL TO authenticated USING (public.is_gestor_regras(auth.uid())) WITH CHECK (public.is_gestor_regras(auth.uid()));
CREATE POLICY pap_faixas_write ON public.parametros_pap_faixas
  FOR ALL TO authenticated USING (public.is_gestor_regras(auth.uid())) WITH CHECK (public.is_gestor_regras(auth.uid()));
CREATE POLICY pap_np_write ON public.parametros_pap_novos_produtos
  FOR ALL TO authenticated USING (public.is_gestor_regras(auth.uid())) WITH CHECK (public.is_gestor_regras(auth.uid()));

INSERT INTO public.parametros_pap_novos_produtos (codigo,nome,percentual,limitado,limite) VALUES
  ('cameras','Câmeras',0.60,true,5000),
  ('casa_inteligente','Casa Inteligente',0.50,true,5000),
  ('movel','Telefonia Unifique Móvel',0.30,false,999999999),
  ('pre_pago','Pré-Pago Móvel',0.08,false,999999999),
  ('retencao_movel','Retenção Móvel',0.08,false,999999999),
  ('planos_tv','Planos de TV',0.30,false,999999999),
  ('telemedicina_pf','Telemedicina PF',1.00,false,999999999),
  ('telemedicina_pj','Telemedicina PJ',1.00,true,5000),
  ('seguro_residencial','Unifique Seguro Residencial',0.50,true,5000),
  ('wifi_business','Wifi Business',0.30,true,5000)
ON CONFLICT (codigo) DO NOTHING;