CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        OR (_role = 'gerente'::public.app_role AND role IN ('lider_pap'::public.app_role, 'gerente_regional'::public.app_role))
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.pode_gerenciar(_manager uuid, _target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(_manager, 'admin'::public.app_role)
    OR public.has_role(_manager, 'regional'::public.app_role)
    OR (
      EXISTS (SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = _manager AND ur.role = 'gerente_regional'::public.app_role)
      AND public.is_gestor_de(_manager, _target)
    )
    OR (
      public.has_role(_manager, 'gerente'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _target
          AND p.gerente_id = _manager
      )
    );
$function$;