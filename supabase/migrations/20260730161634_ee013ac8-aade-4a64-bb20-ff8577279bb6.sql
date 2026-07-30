CREATE TABLE public.parametros_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal public.canal_venda NOT NULL,
  resumo text NOT NULL DEFAULT '',
  fontes text NOT NULL DEFAULT '',
  snapshot jsonb NOT NULL,
  vigencia_inicio timestamptz NOT NULL DEFAULT now(),
  aplicado_por uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.parametros_versoes TO authenticated;
GRANT ALL ON public.parametros_versoes TO service_role;
ALTER TABLE public.parametros_versoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parametros_versoes_select_auth" ON public.parametros_versoes FOR SELECT TO authenticated USING (true);
CREATE INDEX idx_parametros_versoes_canal_vig ON public.parametros_versoes (canal, vigencia_inicio DESC);