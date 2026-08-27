CREATE TABLE public.comissao_condicionantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes_ref date NOT NULL,
  indice_cancelamento numeric NOT NULL DEFAULT 0,
  em_ferias_atestado boolean NOT NULL DEFAULT false,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendedor_id, mes_ref)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comissao_condicionantes TO authenticated;
GRANT ALL ON public.comissao_condicionantes TO service_role;

ALTER TABLE public.comissao_condicionantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cond_select" ON public.comissao_condicionantes
FOR SELECT TO authenticated
USING (vendedor_id = auth.uid() OR public.is_gestor_regras(auth.uid()));

CREATE POLICY "cond_insert" ON public.comissao_condicionantes
FOR INSERT TO authenticated
WITH CHECK (public.is_gestor_regras(auth.uid()));

CREATE POLICY "cond_update" ON public.comissao_condicionantes
FOR UPDATE TO authenticated
USING (public.is_gestor_regras(auth.uid()))
WITH CHECK (public.is_gestor_regras(auth.uid()));

CREATE POLICY "cond_delete" ON public.comissao_condicionantes
FOR DELETE TO authenticated
USING (public.is_gestor_regras(auth.uid()));

CREATE TRIGGER set_updated_at_comissao_condicionantes
BEFORE UPDATE ON public.comissao_condicionantes
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.parametros_gerais (
  chave text PRIMARY KEY,
  label text NOT NULL,
  descricao text,
  valor_bool boolean,
  valor_num numeric,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parametros_gerais TO authenticated;
GRANT ALL ON public.parametros_gerais TO service_role;

ALTER TABLE public.parametros_gerais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pg_select" ON public.parametros_gerais
FOR SELECT TO authenticated USING (true);

CREATE POLICY "pg_insert" ON public.parametros_gerais
FOR INSERT TO authenticated WITH CHECK (public.is_gestor_regras(auth.uid()));

CREATE POLICY "pg_update" ON public.parametros_gerais
FOR UPDATE TO authenticated
USING (public.is_gestor_regras(auth.uid()))
WITH CHECK (public.is_gestor_regras(auth.uid()));

CREATE POLICY "pg_delete" ON public.parametros_gerais
FOR DELETE TO authenticated USING (public.is_gestor_regras(auth.uid()));

CREATE TRIGGER set_updated_at_parametros_gerais
BEFORE UPDATE ON public.parametros_gerais
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.parametros_gerais (chave, label, descricao, valor_bool, valor_num, ordem) VALUES
('pap_faixa_inclui_novos_produtos', 'PAP — receita dos novos produtos (8.2) conta para a faixa', 'Quando ativo, toda a receita instalada do mês define a faixa da Tabela 8.1. Quando inativo, apenas as ativações da 8.1 (core) definem a faixa.', true, NULL, 1),
('pap_acelerador_automatico', 'PAP — estimar índice de cancelamento pelo sistema', 'Quando ativo e não houver índice informado manualmente para o consultor no mês, o sistema estima o índice pelas vendas canceladas do próprio mês.', false, NULL, 2),
('loja_downgrade_negativo', 'Loja — downgrade abate a meta de receita', 'Conforme item 4.2.5 do PV-MER-020: renovações com diferença negativa de ticket são contabilizadas negativamente na apuração da meta de receita.', true, NULL, 3),
('loja_combo_por_protocolo', 'Loja — contabilizar combo BL+Móvel por protocolo', 'Conforme nota do item 7.1 do PV-MER-020: um protocolo com banda larga e várias linhas móveis conta como uma única venda de combo.', true, NULL, 4);