CREATE TYPE public.pos_venda_fase AS ENUM ('satisfacao','produtos');
CREATE TYPE public.pos_venda_resultado AS ENUM ('neutro','sem_resposta','satisfeito','suporte','insatisfeito');

CREATE TABLE public.pos_venda_contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela text NOT NULL CHECK (tabela IN ('vendas_loja','vendas_pap')),
  venda_id uuid NOT NULL,
  vendedor_id uuid NOT NULL,
  fase public.pos_venda_fase NOT NULL,
  resultado public.pos_venda_resultado,
  motivo text,
  produtos jsonb NOT NULL DEFAULT '{}'::jsonb,
  observacao text,
  criado_por uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pos_venda_contatos_venda_idx ON public.pos_venda_contatos (venda_id);
CREATE INDEX pos_venda_contatos_vendedor_idx ON public.pos_venda_contatos (vendedor_id);

GRANT SELECT, INSERT ON public.pos_venda_contatos TO authenticated;
GRANT ALL ON public.pos_venda_contatos TO service_role;

ALTER TABLE public.pos_venda_contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_venda_select" ON public.pos_venda_contatos
  FOR SELECT TO authenticated
  USING (vendedor_id = auth.uid() OR public.is_gestor_de(auth.uid(), vendedor_id));

CREATE POLICY "pos_venda_insert" ON public.pos_venda_contatos
  FOR INSERT TO authenticated
  WITH CHECK (
    criado_por = auth.uid()
    AND (vendedor_id = auth.uid() OR public.is_gestor_de(auth.uid(), vendedor_id))
  );