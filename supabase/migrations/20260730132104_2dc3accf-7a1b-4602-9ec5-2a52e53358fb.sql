CREATE OR REPLACE FUNCTION public.is_gestor_de(_manager uuid, _consultant uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH RECURSIVE desc_tree AS (
    SELECT p.id, p.gerente_id, p.regional_id
    FROM public.profiles p
    WHERE p.gerente_id = _manager OR p.regional_id = _manager
    UNION
    SELECT c.id, c.gerente_id, c.regional_id
    FROM public.profiles c
    JOIN desc_tree d ON c.gerente_id = d.id
  )
  SELECT EXISTS (SELECT 1 FROM desc_tree WHERE id = _consultant)
$$;

CREATE OR REPLACE FUNCTION public.pode_gerenciar(_manager uuid, _target uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.has_role(_manager, 'admin'::public.app_role)
    OR public.has_role(_manager, 'regional'::public.app_role)
    OR (
      public.has_role(_manager, 'gerente'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _target
          AND p.gerente_id = _manager
      )
    );
$$;