-- RLS policies evaluate these helpers as the calling role, so authenticated needs EXECUTE.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_gestor_de(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pode_gerenciar(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_canal(uuid) TO authenticated;