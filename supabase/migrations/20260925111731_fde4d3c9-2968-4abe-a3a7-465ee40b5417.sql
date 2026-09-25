CREATE TABLE public.pos_venda_ajustes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela text NOT NULL CHECK (tabela IN ('vendas_loja','vendas_pap')),
  venda_id uuid NOT NULL,
  vendedor_id uuid NOT NULL,
  fase text CHECK (fase IN ('satisfacao','correcao','produtos')),
  prazo date,
  observacao text,
  criado_por uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.pos_venda_ajustes (venda_id);
CREATE INDEX ON public.pos_venda_ajustes (vendedor_id);
GRANT SELECT, INSERT ON public.pos_venda_ajustes TO authenticated;
GRANT ALL ON public.pos_venda_ajustes TO service_role;
ALTER TABLE public.pos_venda_ajustes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver ajustes pos venda" ON public.pos_venda_ajustes FOR SELECT TO authenticated
USING (vendedor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'regional') OR public.is_gestor_de(auth.uid(), vendedor_id));
CREATE POLICY "criar ajustes pos venda" ON public.pos_venda_ajustes FOR INSERT TO authenticated
WITH CHECK (criado_por = auth.uid() AND (vendedor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'regional') OR public.is_gestor_de(auth.uid(), vendedor_id)));