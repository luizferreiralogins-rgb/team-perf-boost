CREATE TABLE public.planejamento_opcoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lider_id uuid NOT NULL,
  campo text NOT NULL CHECK (campo IN ('tipo_acao','cidade','local','consultor')),
  valor text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lider_id, campo, valor)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planejamento_opcoes TO authenticated;
GRANT ALL ON public.planejamento_opcoes TO service_role;
ALTER TABLE public.planejamento_opcoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver opcoes do planejamento da hierarquia"
ON public.planejamento_opcoes FOR SELECT TO authenticated
USING (
  lider_id = auth.uid()
  OR public.is_gestor_de(lider_id, auth.uid())
  OR public.is_gestor_de(auth.uid(), lider_id)
);

CREATE POLICY "Lider PAP gerencia suas opcoes"
ON public.planejamento_opcoes FOR ALL TO authenticated
USING (lider_id = auth.uid())
WITH CHECK (lider_id = auth.uid());

CREATE TABLE public.planejamento_acoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lider_id uuid NOT NULL,
  data date NOT NULL,
  tipo_acao text,
  cidade text,
  local text,
  consultores text,
  leads integer,
  fechado_bl integer,
  fechado_movel integer,
  obs text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planejamento_acoes TO authenticated;
GRANT ALL ON public.planejamento_acoes TO service_role;
ALTER TABLE public.planejamento_acoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver planejamento da hierarquia"
ON public.planejamento_acoes FOR SELECT TO authenticated
USING (
  lider_id = auth.uid()
  OR public.is_gestor_de(lider_id, auth.uid())
  OR public.is_gestor_de(auth.uid(), lider_id)
);

CREATE POLICY "Lider PAP gerencia seu planejamento"
ON public.planejamento_acoes FOR ALL TO authenticated
USING (lider_id = auth.uid())
WITH CHECK (lider_id = auth.uid());

CREATE TRIGGER trg_planejamento_opcoes_updated_at
BEFORE UPDATE ON public.planejamento_opcoes
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER trg_planejamento_acoes_updated_at
BEFORE UPDATE ON public.planejamento_acoes
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();