CREATE TABLE public.agendamento_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela text NOT NULL CHECK (tabela IN ('vendas_loja','vendas_pap')),
  venda_id uuid NOT NULL,
  vendedor_id uuid NOT NULL,
  data_anterior date,
  data_nova date,
  motivo text NOT NULL,
  criado_por uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.agendamento_historico TO authenticated;
GRANT ALL ON public.agendamento_historico TO service_role;

ALTER TABLE public.agendamento_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hist_agend_select" ON public.agendamento_historico
FOR SELECT TO authenticated
USING (
  criado_por = auth.uid()
  OR vendedor_id = auth.uid()
  OR public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.has_role(auth.uid(),'regional'::public.app_role)
  OR public.is_gestor_de(auth.uid(), vendedor_id)
);

CREATE POLICY "hist_agend_insert" ON public.agendamento_historico
FOR INSERT TO authenticated
WITH CHECK (
  criado_por = auth.uid()
  AND (
    vendedor_id = auth.uid()
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'regional'::public.app_role)
    OR public.is_gestor_de(auth.uid(), vendedor_id)
  )
);

CREATE INDEX idx_agend_hist_venda ON public.agendamento_historico (tabela, venda_id, created_at DESC);