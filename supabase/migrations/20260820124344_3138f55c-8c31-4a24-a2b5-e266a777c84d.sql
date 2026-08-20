REVOKE ALL ON FUNCTION public.telegram_account_e_minha(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.telegram_account_e_minha(uuid) TO authenticated, service_role;