CREATE TABLE public.prospeccao_status_opcoes (
  chave text PRIMARY KEY,
  nome text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.prospeccao_status_opcoes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.prospeccao_status_opcoes TO authenticated;
GRANT ALL ON public.prospeccao_status_opcoes TO service_role;
ALTER TABLE public.prospeccao_status_opcoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY pso_read ON public.prospeccao_status_opcoes FOR SELECT TO authenticated USING (true);
CREATE POLICY pso_ins ON public.prospeccao_status_opcoes FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'regional') OR has_role(auth.uid(),'admin'));
CREATE POLICY pso_upd ON public.prospeccao_status_opcoes FOR UPDATE TO authenticated USING (has_role(auth.uid(),'regional') OR has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'regional') OR has_role(auth.uid(),'admin'));
CREATE POLICY pso_del ON public.prospeccao_status_opcoes FOR DELETE TO authenticated USING (has_role(auth.uid(),'regional') OR has_role(auth.uid(),'admin'));
INSERT INTO public.prospeccao_status_opcoes (chave,nome,ordem) VALUES
('contato_feito','Contato feito',1),('negociando','Negociando',2),('fechado','Fechado',3),('declinou','Declinou',4),('nao_perturbar','Não perturbar',5),('sem_whatsapp','Sem WhatsApp',6);
ALTER TABLE public.prospeccoes DROP CONSTRAINT prospeccoes_status_chk;