CREATE TABLE public.unidades_loja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.unidades_loja TO authenticated;
GRANT ALL ON public.unidades_loja TO service_role;

ALTER TABLE public.unidades_loja ENABLE ROW LEVEL SECURITY;

CREATE POLICY "unidades_loja_read" ON public.unidades_loja
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "unidades_loja_insert" ON public.unidades_loja
  FOR INSERT TO authenticated WITH CHECK (public.is_gestor_regras(auth.uid()));
CREATE POLICY "unidades_loja_update" ON public.unidades_loja
  FOR UPDATE TO authenticated USING (public.is_gestor_regras(auth.uid()))
  WITH CHECK (public.is_gestor_regras(auth.uid()));
CREATE POLICY "unidades_loja_delete" ON public.unidades_loja
  FOR DELETE TO authenticated USING (public.is_gestor_regras(auth.uid()));

CREATE TRIGGER unidades_loja_set_updated_at
  BEFORE UPDATE ON public.unidades_loja
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.profiles
  ALTER COLUMN loja_unidade TYPE text USING loja_unidade::text;

INSERT INTO public.unidades_loja (nome, ordem) VALUES
  ('Norte', 1), ('Sul', 2), ('Shopping', 3)
ON CONFLICT (nome) DO NOTHING;