CREATE TABLE public.prospeccoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL,
  gerente_id uuid NOT NULL,
  nome_cliente text NOT NULL,
  cpf_cnpj text,
  telefone text,
  item text,
  categoria text,
  data_registro timestamptz,
  unidade text,
  plano text,
  status text,
  data_contato date,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospeccoes_status_chk CHECK (status IS NULL OR status IN ('contato_feito','negociando','fechado','declinou','nao_perturbar','sem_whatsapp'))
);
CREATE INDEX prospeccoes_vendedor_idx ON public.prospeccoes(vendedor_id, nome_cliente);
CREATE INDEX prospeccoes_gerente_idx ON public.prospeccoes(gerente_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospeccoes TO authenticated;
GRANT ALL ON public.prospeccoes TO service_role;
ALTER TABLE public.prospeccoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prosp_select" ON public.prospeccoes FOR SELECT TO authenticated
  USING (vendedor_id = auth.uid() OR gerente_id = auth.uid() OR public.is_gestor_de(auth.uid(), vendedor_id) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'regional'));
CREATE POLICY "prosp_update" ON public.prospeccoes FOR UPDATE TO authenticated
  USING (vendedor_id = auth.uid() OR public.is_gestor_de(auth.uid(), vendedor_id) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'regional'));
CREATE POLICY "prosp_insert" ON public.prospeccoes FOR INSERT TO authenticated
  WITH CHECK (gerente_id = auth.uid() AND (public.is_gestor_de(auth.uid(), vendedor_id) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'regional')));
CREATE POLICY "prosp_delete" ON public.prospeccoes FOR DELETE TO authenticated
  USING (gerente_id = auth.uid() OR public.is_gestor_de(auth.uid(), vendedor_id) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'regional'));
CREATE TRIGGER prosp_updated BEFORE UPDATE ON public.prospeccoes FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.prospeccoes_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL,
  gerente_id uuid NOT NULL,
  nome_cliente text NOT NULL,
  cpf_cnpj text,
  telefone text,
  status text,
  data_contato date,
  observacao text,
  arquivado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prosp_hist_vendedor_idx ON public.prospeccoes_historico(vendedor_id, arquivado_em DESC);
GRANT SELECT ON public.prospeccoes_historico TO authenticated;
GRANT ALL ON public.prospeccoes_historico TO service_role;
ALTER TABLE public.prospeccoes_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prosp_hist_select" ON public.prospeccoes_historico FOR SELECT TO authenticated
  USING (vendedor_id = auth.uid() OR gerente_id = auth.uid() OR public.is_gestor_de(auth.uid(), vendedor_id) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'regional'));

CREATE OR REPLACE FUNCTION public.limpar_prospeccoes()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  WITH alvo AS (
    DELETE FROM public.prospeccoes p
    WHERE p.gerente_id = auth.uid() OR public.is_gestor_de(auth.uid(), p.vendedor_id)
      OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'regional')
    RETURNING p.*
  ), ins AS (
    INSERT INTO public.prospeccoes_historico(vendedor_id, gerente_id, nome_cliente, cpf_cnpj, telefone, status, data_contato, observacao)
    SELECT vendedor_id, gerente_id, nome_cliente, cpf_cnpj, telefone, status, data_contato, observacao FROM alvo
    RETURNING 1
  )
  SELECT count(*) INTO n FROM ins;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.limpar_prospeccoes() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.limpar_prospeccoes() TO authenticated;