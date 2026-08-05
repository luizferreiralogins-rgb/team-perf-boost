CREATE TABLE public.estrategico_cidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  cidade text NOT NULL,
  ano smallint NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  portas_total numeric NOT NULL DEFAULT 0,
  portas_ocupadas numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, cidade, ano)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estrategico_cidades TO authenticated;
GRANT ALL ON public.estrategico_cidades TO service_role;
ALTER TABLE public.estrategico_cidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estr_cidades_read" ON public.estrategico_cidades FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.has_role(auth.uid(),'regional'::public.app_role)
  OR public.is_gestor_de(auth.uid(), owner_id)
);
CREATE POLICY "estr_cidades_insert" ON public.estrategico_cidades FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid() AND public.is_gestor_regras(auth.uid()));
CREATE POLICY "estr_cidades_update" ON public.estrategico_cidades FOR UPDATE TO authenticated
USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'regional'::public.app_role))
WITH CHECK (true);
CREATE POLICY "estr_cidades_delete" ON public.estrategico_cidades FOR DELETE TO authenticated
USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'regional'::public.app_role));

CREATE TRIGGER estrategico_cidades_set_updated_at BEFORE UPDATE ON public.estrategico_cidades
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.estrategico_mensal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cidade_id uuid NOT NULL REFERENCES public.estrategico_cidades(id) ON DELETE CASCADE,
  mes smallint NOT NULL,
  vendas numeric NOT NULL DEFAULT 0,
  meta_vendas numeric NOT NULL DEFAULT 0,
  quebra_venda numeric NOT NULL DEFAULT 0,
  vendas_brutas numeric NOT NULL DEFAULT 0,
  ativacoes numeric NOT NULL DEFAULT 0,
  meta_ativacoes numeric NOT NULL DEFAULT 0,
  acessos_anatel numeric NOT NULL DEFAULT 0,
  cancel_voluntario numeric NOT NULL DEFAULT 0,
  cancel_involuntario numeric NOT NULL DEFAULT 0,
  market_share numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cidade_id, mes)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estrategico_mensal TO authenticated;
GRANT ALL ON public.estrategico_mensal TO service_role;
ALTER TABLE public.estrategico_mensal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estr_mensal_read" ON public.estrategico_mensal FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.estrategico_cidades c WHERE c.id = cidade_id));
CREATE POLICY "estr_mensal_insert" ON public.estrategico_mensal FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.estrategico_cidades c WHERE c.id = cidade_id
    AND (c.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'regional'::public.app_role))
));
CREATE POLICY "estr_mensal_update" ON public.estrategico_mensal FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.estrategico_cidades c WHERE c.id = cidade_id
    AND (c.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'regional'::public.app_role))
)) WITH CHECK (true);
CREATE POLICY "estr_mensal_delete" ON public.estrategico_mensal FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.estrategico_cidades c WHERE c.id = cidade_id
    AND (c.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'regional'::public.app_role))
));

CREATE TRIGGER estrategico_mensal_set_updated_at BEFORE UPDATE ON public.estrategico_mensal
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.estrategico_cidades (owner_id, cidade, ano, portas_total, portas_ocupadas) VALUES
 ('159db3e7-8824-46e2-a6c8-a154fda7eb5b','Araquari',2026,24583,11812),
 ('159db3e7-8824-46e2-a6c8-a154fda7eb5b','Balneário Barra do Sul',2026,7920,3872),
 ('159db3e7-8824-46e2-a6c8-a154fda7eb5b','Joinville',2026,182657,74428),
 ('159db3e7-8824-46e2-a6c8-a154fda7eb5b','São Francisco do Sul',2026,6176,451);