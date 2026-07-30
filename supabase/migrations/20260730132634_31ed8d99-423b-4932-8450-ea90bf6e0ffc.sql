DROP POLICY IF EXISTS profiles_select_self_or_managed ON public.profiles;
CREATE POLICY profiles_select_self_or_managed ON public.profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'regional'::public.app_role)
  OR (public.has_role(auth.uid(), 'gerente'::public.app_role) AND public.is_gestor_de(auth.uid(), id))
);