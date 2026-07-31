CREATE TABLE public.parametros_tempos (
  chave text PRIMARY KEY,
  label text NOT NULL,
  minutos numeric NOT NULL DEFAULT 0,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parametros_tempos TO authenticated;
GRANT ALL ON public.parametros_tempos TO service_role;

ALTER TABLE public.parametros_tempos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tempos_select_auth" ON public.parametros_tempos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tempos_insert_master" ON public.parametros_tempos
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'regional'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role));

CREATE POLICY "tempos_update_master" ON public.parametros_tempos
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'regional'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'regional'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role));

CREATE POLICY "tempos_delete_master" ON public.parametros_tempos
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'regional'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role));

CREATE TRIGGER trg_parametros_tempos_updated_at
  BEFORE UPDATE ON public.parametros_tempos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.parametros_tempos (chave, label, minutos, ordem) VALUES
  ('pagamento','Pagamento',5,1),
  ('boleto','Boleto',5,2),
  ('suporte','Suporte',15,3),
  ('cancelamento','Cancelamento',20,4),
  ('duvida','Dúvida',10,5),
  ('entrega_equipamento','Entrega de equipamento',10,6),
  ('reclamacao','Reclamação',20,7),
  ('ativacao_configuracao','Ativação/Configuração',20,8),
  ('retirada_chip','Retirada de Chip',10,9),
  ('venda','Venda registrada',30,10),
  ('lead','Lead (cadastro/contato)',10,11);