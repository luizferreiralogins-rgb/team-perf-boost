CREATE TABLE public.contestacao_importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes_ref date NOT NULL,
  canal public.canal_venda NOT NULL,
  arquivo_nome text NOT NULL,
  total_linhas integer NOT NULL DEFAULT 0,
  criado_por uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contestacao_vendas_nativas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id uuid NOT NULL REFERENCES public.contestacao_importacoes(id) ON DELETE CASCADE,
  mes_ref date NOT NULL,
  canal public.canal_venda NOT NULL,
  protocolo text,
  nome_cliente text NOT NULL,
  cpf_cnpj text,
  consultor_nome text,
  valor numeric NOT NULL DEFAULT 0,
  data_instalacao date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cvn_mes_canal ON public.contestacao_vendas_nativas (mes_ref, canal);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contestacao_importacoes TO authenticated;
GRANT ALL ON public.contestacao_importacoes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contestacao_vendas_nativas TO authenticated;
GRANT ALL ON public.contestacao_vendas_nativas TO service_role;

ALTER TABLE public.contestacao_importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contestacao_vendas_nativas ENABLE ROW LEVEL SECURITY;

CREATE POLICY imp_select ON public.contestacao_importacoes FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY imp_insert ON public.contestacao_importacoes FOR INSERT TO authenticated WITH CHECK (
  criado_por = auth.uid() AND (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'regional'::public.app_role)
    OR public.has_role(auth.uid(),'gerente'::public.app_role)
  )
);
CREATE POLICY imp_delete ON public.contestacao_importacoes FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.has_role(auth.uid(),'regional'::public.app_role)
  OR public.has_role(auth.uid(),'gerente'::public.app_role)
);

CREATE POLICY cvn_select ON public.contestacao_vendas_nativas FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY cvn_insert ON public.contestacao_vendas_nativas FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.has_role(auth.uid(),'regional'::public.app_role)
  OR public.has_role(auth.uid(),'gerente'::public.app_role)
);
CREATE POLICY cvn_delete ON public.contestacao_vendas_nativas FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.has_role(auth.uid(),'regional'::public.app_role)
  OR public.has_role(auth.uid(),'gerente'::public.app_role)
);