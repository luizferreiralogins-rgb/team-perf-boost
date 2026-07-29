
-- 1. Enum loja_unidade
CREATE TYPE public.loja_unidade AS ENUM ('norte', 'sul', 'shopping');

-- 2. Coluna profiles.loja_unidade
ALTER TABLE public.profiles ADD COLUMN loja_unidade public.loja_unidade;

-- 3. Ajuste handle_new_user: primeiro usuário = regional, demais = consultor
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first boolean;
  chosen_role public.app_role;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  chosen_role := CASE WHEN is_first THEN 'regional'::public.app_role ELSE 'consultor'::public.app_role END;

  INSERT INTO public.profiles (id, nome, email, canal)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'canal')::public.canal_venda, 'loja'::public.canal_venda)
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, chosen_role);
  RETURN NEW;
END;
$$;

-- Ensure trigger exists (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Função pode_gerenciar: quem o chamador pode administrar
CREATE OR REPLACE FUNCTION public.pode_gerenciar(_manager uuid, _target uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- admin/regional podem tudo
    public.has_role(_manager, 'admin'::public.app_role)
    OR public.has_role(_manager, 'regional'::public.app_role)
    OR (
      -- gerente só pode mexer em consultor do próprio time
      public.has_role(_manager, 'gerente'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _target
          AND p.gerente_id = _manager
          AND public.has_role(_target, 'consultor'::public.app_role)
      )
    );
$$;

-- 5. Políticas ampliadas em profiles
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self_or_manager
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.pode_gerenciar(auth.uid(), id))
  WITH CHECK (id = auth.uid() OR public.pode_gerenciar(auth.uid(), id));

DROP POLICY IF EXISTS profiles_insert_self ON public.profiles;
CREATE POLICY profiles_insert_self_or_manager
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'regional'::public.app_role)
    OR public.has_role(auth.uid(), 'gerente'::public.app_role)
  );

-- Regional pode ver todos os perfis (já existia parcial; garantimos)
DROP POLICY IF EXISTS profiles_select_self_or_managed ON public.profiles;
CREATE POLICY profiles_select_self_or_managed
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'regional'::public.app_role)
    OR (public.has_role(auth.uid(), 'gerente'::public.app_role) AND (gerente_id = auth.uid() OR regional_id = auth.uid()))
  );

-- 6. Políticas em user_roles
DROP POLICY IF EXISTS user_roles_admin_all ON public.user_roles;

CREATE POLICY user_roles_admin_all
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY user_roles_regional_manage
  ON public.user_roles FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'regional'::public.app_role)
    AND role IN ('gerente'::public.app_role, 'consultor'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'regional'::public.app_role)
    AND role IN ('gerente'::public.app_role, 'consultor'::public.app_role)
  );

CREATE POLICY user_roles_gerente_manage_consultor
  ON public.user_roles FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'gerente'::public.app_role)
    AND role = 'consultor'::public.app_role
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_roles.user_id AND p.gerente_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'gerente'::public.app_role)
    AND role = 'consultor'::public.app_role
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_roles.user_id AND p.gerente_id = auth.uid())
  );
