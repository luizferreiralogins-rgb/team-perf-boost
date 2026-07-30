CREATE OR REPLACE FUNCTION public.listar_destinatarios_venda()
RETURNS TABLE(id uuid, nome text, canal public.canal_venda)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome, p.canal
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'consultor'::public.app_role
  WHERE p.ativo AND p.id <> auth.uid() AND auth.uid() IS NOT NULL
  ORDER BY p.nome
$$;

REVOKE ALL ON FUNCTION public.listar_destinatarios_venda() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_destinatarios_venda() TO authenticated;