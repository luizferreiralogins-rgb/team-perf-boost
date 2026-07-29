CREATE POLICY tm_owner_insert ON public.telegram_mensagens
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
GRANT INSERT ON public.telegram_mensagens TO authenticated;