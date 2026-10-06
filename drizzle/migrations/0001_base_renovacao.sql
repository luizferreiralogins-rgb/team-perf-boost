CREATE TABLE public.base_renovacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gerente_id uuid NOT NULL,
  consultor_id uuid NOT NULL,
  status text CHECK (status IN ('contato_feito','negociando','fechado','declinou','nao_perturbar','sem_whatsapp')),
  data_contato date,
  nome_cliente text NOT NULL,
  cidade text, telefone text, plano text, valor numeric, velox text,
  tipo_pessoa text, cpf_cnpj text, obs text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.base_renovacao(consultor_id);
CREATE INDEX ON public.base_renovacao(gerente_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.base_renovacao TO authenticated;
GRANT ALL ON public.base_renovacao TO service_role;
ALTER TABLE public.base_renovacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY br_select ON public.base_renovacao FOR SELECT TO authenticated
  USING (consultor_id = auth.uid() OR gerente_id = auth.uid() OR public.pode_gerenciar(auth.uid(), consultor_id));
CREATE POLICY br_insert ON public.base_renovacao FOR INSERT TO authenticated
  WITH CHECK (gerente_id = auth.uid() AND public.pode_gerenciar(auth.uid(), consultor_id));
CREATE POLICY br_update ON public.base_renovacao FOR UPDATE TO authenticated
  USING (consultor_id = auth.uid() OR gerente_id = auth.uid() OR public.pode_gerenciar(auth.uid(), consultor_id));
CREATE TRIGGER br_updated BEFORE UPDATE ON public.base_renovacao FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.base_renovacao_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gerente_id uuid NOT NULL,
  consultor_id uuid NOT NULL,
  nome_cliente text NOT NULL,
  cpf_cnpj text, telefone text, status text, data_contato date, obs text,
  arquivado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.base_renovacao_historico(consultor_id);
GRANT SELECT ON public.base_renovacao_historico TO authenticated;
GRANT ALL ON public.base_renovacao_historico TO service_role;
ALTER TABLE public.base_renovacao_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY brh_select ON public.base_renovacao_historico FOR SELECT TO authenticated
  USING (consultor_id = auth.uid() OR gerente_id = auth.uid() OR public.pode_gerenciar(auth.uid(), consultor_id));

CREATE OR REPLACE FUNCTION public.limpar_base_renovacao()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_gestor_regras(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  INSERT INTO public.base_renovacao_historico (gerente_id, consultor_id, nome_cliente, cpf_cnpj, telefone, status, data_contato, obs)
    SELECT gerente_id, consultor_id, nome_cliente, cpf_cnpj, telefone, status, data_contato, obs
    FROM public.base_renovacao WHERE gerente_id = auth.uid();
  DELETE FROM public.base_renovacao WHERE gerente_id = auth.uid();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.limpar_base_renovacao() FROM anon;