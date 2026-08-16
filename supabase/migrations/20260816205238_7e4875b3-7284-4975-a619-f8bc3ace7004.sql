CREATE TABLE public.opcoes_canais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('venda','atendimento')),
  nome text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, nome)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opcoes_canais TO authenticated;
GRANT ALL ON public.opcoes_canais TO service_role;

ALTER TABLE public.opcoes_canais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opcoes_canais_read" ON public.opcoes_canais
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "opcoes_canais_insert" ON public.opcoes_canais
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'regional') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "opcoes_canais_update" ON public.opcoes_canais
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'regional') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'regional') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "opcoes_canais_delete" ON public.opcoes_canais
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'regional') OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_opcoes_canais_updated_at
  BEFORE UPDATE ON public.opcoes_canais
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.opcoes_canais (tipo, nome, ordem) VALUES
  ('venda','Loja',1),
  ('venda','Indicação',2),
  ('venda','Prospecção Base',3),
  ('venda','Lista Autoatendimento',4),
  ('venda','Lista Núcleo Eficiência',5),
  ('atendimento','Loja',1),
  ('atendimento','WhatsApp',2),
  ('atendimento','Telefone',3);

ALTER TABLE public.vendas_loja ADD COLUMN canal_origem text;
ALTER TABLE public.vendas_pap ADD COLUMN canal_origem text;
ALTER TABLE public.atendimentos ADD COLUMN canal_atendimento text;