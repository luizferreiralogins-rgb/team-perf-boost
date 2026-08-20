REVOKE EXECUTE ON FUNCTION public.planejamento_resumo_pap(date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.planejamento_resumo_pap(date) TO authenticated;