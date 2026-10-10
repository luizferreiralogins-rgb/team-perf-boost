CREATE TABLE public.indicacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL DEFAULT auth.uid(),
  cliente_nome text NOT NULL,
  cliente_cpf text NOT NULL,
  indicado_nome text NOT NULL,
  indicado_celular text NOT NULL,
  indicado_email text,
  status text NOT NULL DEFAULT 'contato_feito',
  historico jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.indicacoes TO authenticated;
GRANT ALL ON public.indicacoes TO service_role;
ALTER TABLE public.indicacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver indicacoes" ON public.indicacoes FOR SELECT TO authenticated
USING (vendedor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'regional') OR public.is_gestor_de(auth.uid(), vendedor_id));
CREATE POLICY "criar indicacoes" ON public.indicacoes FOR INSERT TO authenticated WITH CHECK (vendedor_id = auth.uid());
CREATE POLICY "editar indicacoes" ON public.indicacoes FOR UPDATE TO authenticated USING (vendedor_id = auth.uid()) WITH CHECK (vendedor_id = auth.uid());
CREATE POLICY "excluir indicacoes" ON public.indicacoes FOR DELETE TO authenticated USING (vendedor_id = auth.uid());
CREATE TRIGGER indicacoes_set_updated_at BEFORE UPDATE ON public.indicacoes FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();