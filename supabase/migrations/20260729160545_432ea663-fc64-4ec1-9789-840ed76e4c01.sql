-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('consultor', 'gerente', 'regional', 'admin');
CREATE TYPE public.canal_venda AS ENUM ('loja', 'pap');
CREATE TYPE public.venda_status AS ENUM ('pendente', 'instalado', 'cancelado', 'em_analise');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  email TEXT,
  canal public.canal_venda NOT NULL DEFAULT 'loja',
  gerente_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  regional_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cidade TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER_ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- É gestor (direto ou regional) de outro usuário?
CREATE OR REPLACE FUNCTION public.is_gestor_de(_manager UUID, _consultant UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _consultant
      AND (p.gerente_id = _manager OR p.regional_id = _manager)
  )
$$;

-- Retorna o canal do usuário
CREATE OR REPLACE FUNCTION public.get_canal(_user UUID)
RETURNS public.canal_venda
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT canal FROM public.profiles WHERE id = _user
$$;

-- Policies profiles
CREATE POLICY "profiles_select_self_or_managed"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'regional')
    OR (public.has_role(auth.uid(), 'gerente') AND (gerente_id = auth.uid() OR regional_id = auth.uid()))
  );

CREATE POLICY "profiles_update_self"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "profiles_insert_self"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Policies user_roles (leitura própria + gestores; admin gerencia)
CREATE POLICY "user_roles_select"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'regional') OR public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "user_roles_admin_all"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger auto profile + role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email, canal)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'canal')::public.canal_venda, 'loja')
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'consultor');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ VENDAS LOJA ============
CREATE TABLE public.vendas_loja (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  protocolo TEXT,
  nome_cliente TEXT NOT NULL,
  cpf_cnpj TEXT,
  observacoes TEXT,
  data_abertura DATE,
  data_ativacao DATE,
  classe_protocolo TEXT,
  contem_movel BOOLEAN NOT NULL DEFAULT false,
  qtd_linhas INTEGER NOT NULL DEFAULT 0,
  tecnologia TEXT,
  valor_novo NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_antigo NUMERIC(10,2),
  meses_fidelidade INTEGER,
  tipo_comissao TEXT,
  comissao NUMERIC(10,2) NOT NULL DEFAULT 0,
  status public.venda_status NOT NULL DEFAULT 'pendente',
  mes_ref DATE NOT NULL DEFAULT date_trunc('month', now())::date,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vendas_loja_vendedor_idx ON public.vendas_loja(vendedor_id, mes_ref);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendas_loja TO authenticated;
GRANT ALL ON public.vendas_loja TO service_role;
ALTER TABLE public.vendas_loja ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendas_loja_owner_all" ON public.vendas_loja FOR ALL TO authenticated
  USING (vendedor_id = auth.uid()) WITH CHECK (vendedor_id = auth.uid());

CREATE POLICY "vendas_loja_manager_read" ON public.vendas_loja FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'regional')
    OR (public.has_role(auth.uid(), 'gerente') AND public.is_gestor_de(auth.uid(), vendedor_id))
  );

CREATE TRIGGER vendas_loja_set_updated_at BEFORE UPDATE ON public.vendas_loja
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ VENDAS PAP ============
CREATE TABLE public.vendas_pap (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_cliente TEXT NOT NULL,
  cpf_cnpj TEXT,
  telefone TEXT,
  endereco TEXT,
  cidade TEXT,
  bairro TEXT,
  produto TEXT,
  tecnologia TEXT,
  valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  data_venda DATE NOT NULL DEFAULT current_date,
  data_ativacao DATE,
  status public.venda_status NOT NULL DEFAULT 'pendente',
  comissao NUMERIC(10,2) NOT NULL DEFAULT 0,
  observacoes TEXT,
  mes_ref DATE NOT NULL DEFAULT date_trunc('month', now())::date,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vendas_pap_vendedor_idx ON public.vendas_pap(vendedor_id, mes_ref);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendas_pap TO authenticated;
GRANT ALL ON public.vendas_pap TO service_role;
ALTER TABLE public.vendas_pap ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendas_pap_owner_all" ON public.vendas_pap FOR ALL TO authenticated
  USING (vendedor_id = auth.uid()) WITH CHECK (vendedor_id = auth.uid());

CREATE POLICY "vendas_pap_manager_read" ON public.vendas_pap FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'regional')
    OR (public.has_role(auth.uid(), 'gerente') AND public.is_gestor_de(auth.uid(), vendedor_id))
  );

CREATE TRIGGER vendas_pap_set_updated_at BEFORE UPDATE ON public.vendas_pap
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ PARAMETROS LOJA ============
-- Faixas por Diferença de Ticket x Faixa Efetiva (0..3)
CREATE TABLE public.parametros_loja_faixas_ticket (
  id SERIAL PRIMARY KEY,
  diff_de NUMERIC(10,2) NOT NULL,
  diff_ate NUMERIC(14,2) NOT NULL,
  faixa_0 NUMERIC(10,2) NOT NULL,
  faixa_1 NUMERIC(10,2) NOT NULL,
  faixa_2 NUMERIC(10,2) NOT NULL,
  faixa_3 NUMERIC(10,2) NOT NULL
);
GRANT SELECT ON public.parametros_loja_faixas_ticket TO authenticated;
GRANT ALL ON public.parametros_loja_faixas_ticket TO service_role;
ALTER TABLE public.parametros_loja_faixas_ticket ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loja_faixas_read" ON public.parametros_loja_faixas_ticket FOR SELECT TO authenticated USING (true);

INSERT INTO public.parametros_loja_faixas_ticket (diff_de, diff_ate, faixa_0, faixa_1, faixa_2, faixa_3) VALUES
  (0,10,0,0,0,0),
  (10,20,0,10,12.5,15),
  (20,30,0,20,25,30),
  (30,40,0,30,37.5,45),
  (40,50,0,40,50,60),
  (50,60,0,50,62.5,75),
  (60,70,0,60,75,90),
  (70,80,0,70,87.5,105),
  (80,90,0,80,100,120),
  (90,100,0,90,112.5,135),
  (100,9999999999,0,100,125,150);

-- Metas Loja: define faixa efetiva
CREATE TABLE public.parametros_loja_metas (
  faixa SMALLINT PRIMARY KEY,
  meta_renov_movel NUMERIC(4,2) NOT NULL,
  meta_receita NUMERIC(12,2) NOT NULL
);
GRANT SELECT ON public.parametros_loja_metas TO authenticated;
GRANT ALL ON public.parametros_loja_metas TO service_role;
ALTER TABLE public.parametros_loja_metas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loja_metas_read" ON public.parametros_loja_metas FOR SELECT TO authenticated USING (true);

INSERT INTO public.parametros_loja_metas (faixa, meta_renov_movel, meta_receita) VALUES
  (1, 0.0, 2500),
  (2, 0.5, 5000),
  (3, 0.7, 999999.99);

-- Novos produtos Loja
CREATE TABLE public.parametros_loja_novos_produtos (
  codigo TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  percentual NUMERIC(5,4) NOT NULL
);
GRANT SELECT ON public.parametros_loja_novos_produtos TO authenticated;
GRANT ALL ON public.parametros_loja_novos_produtos TO service_role;
ALTER TABLE public.parametros_loja_novos_produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loja_np_read" ON public.parametros_loja_novos_produtos FOR SELECT TO authenticated USING (true);

INSERT INTO public.parametros_loja_novos_produtos (codigo, nome, percentual) VALUES
  ('12.01', 'Telemedicina', 1.0),
  ('13.01', 'Seguros', 0.5),
  ('15.01', 'Casa Inteligente', 0.5),
  ('10.01', 'Câmeras de monitoramento', 0.6),
  ('14.04', 'Telefonia Móvel Pré-pago', 0.08);

-- ============ PARAMETROS PAP ============
CREATE TABLE public.parametros_pap_faixas (
  id SERIAL PRIMARY KEY,
  faixa SMALLINT NOT NULL,
  receita_de NUMERIC(12,2) NOT NULL,
  receita_ate NUMERIC(14,2) NOT NULL,
  pct_comissao NUMERIC(6,4) NOT NULL,
  meta_max_cancel NUMERIC(5,4) NOT NULL,
  acelerador_baixo_cancel NUMERIC(5,4) NOT NULL,
  bonus_venda_indireta NUMERIC(6,4) NOT NULL
);
GRANT SELECT ON public.parametros_pap_faixas TO authenticated;
GRANT ALL ON public.parametros_pap_faixas TO service_role;
ALTER TABLE public.parametros_pap_faixas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pap_faixas_read" ON public.parametros_pap_faixas FOR SELECT TO authenticated USING (true);

INSERT INTO public.parametros_pap_faixas (faixa, receita_de, receita_ate, pct_comissao, meta_max_cancel, acelerador_baixo_cancel, bonus_venda_indireta) VALUES
  (1, 0, 1500, 0.05, 0.08, 0.05, 0.025),
  (2, 1500.01, 1750, 0.14, 0.08, 0.05, 0.07),
  (3, 1750.01, 2000, 0.16, 0.08, 0.05, 0.08),
  (4, 2000.01, 2250, 0.19, 0.08, 0.05, 0.095),
  (5, 2250.01, 2500, 0.21, 0.08, 0.05, 0.105),
  (6, 2500.01, 2750, 0.25, 0.08, 0.05, 0.125),
  (7, 2750.01, 3000, 0.28, 0.08, 0.05, 0.14),
  (8, 3000.01, 3250, 0.19, 0.08, 0.05, 0.145),
  (9, 3250.01, 3500, 0.31, 0.08, 0.05, 0.155),
  (10, 3500.01, 999999999, 0.33, 0.08, 0.05, 0.165);