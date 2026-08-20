-- ACCOUNTS
CREATE TABLE public.telegram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_user_id bigint,
  username text,
  phone_number text,
  first_name text,
  last_name text,
  profile_photo_url text,
  status text NOT NULL DEFAULT 'desconectado',
  session_reference text,
  last_error text,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_accounts TO authenticated;
GRANT ALL ON public.telegram_accounts TO service_role;
ALTER TABLE public.telegram_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tg_accounts_own" ON public.telegram_accounts FOR ALL TO authenticated
  USING (crm_user_id = auth.uid()) WITH CHECK (crm_user_id = auth.uid());
CREATE TRIGGER telegram_accounts_set_updated_at BEFORE UPDATE ON public.telegram_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.telegram_account_e_minha(_account_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.telegram_accounts a
                 WHERE a.id = _account_id AND a.crm_user_id = auth.uid())
$$;

-- CONTACTS
CREATE TABLE public.telegram_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_account_id uuid NOT NULL REFERENCES public.telegram_accounts(id) ON DELETE CASCADE,
  telegram_user_id bigint NOT NULL,
  access_hash text,
  username text,
  first_name text,
  last_name text,
  phone text,
  profile_photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_account_id, telegram_user_id)
);
GRANT SELECT ON public.telegram_contacts TO authenticated;
GRANT ALL ON public.telegram_contacts TO service_role;
ALTER TABLE public.telegram_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tg_contacts_own_select" ON public.telegram_contacts FOR SELECT TO authenticated
  USING (public.telegram_account_e_minha(telegram_account_id));
CREATE TRIGGER telegram_contacts_set_updated_at BEFORE UPDATE ON public.telegram_contacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
REVOKE SELECT (access_hash) ON public.telegram_contacts FROM authenticated;

-- CHATS
CREATE TABLE public.telegram_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_account_id uuid NOT NULL REFERENCES public.telegram_accounts(id) ON DELETE CASCADE,
  telegram_chat_id bigint NOT NULL,
  access_hash text,
  chat_type text NOT NULL DEFAULT 'private',
  title text,
  username text,
  phone text,
  photo_url text,
  unread_count integer NOT NULL DEFAULT 0,
  last_message_id bigint,
  last_message_text text,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_account_id, telegram_chat_id)
);
GRANT SELECT ON public.telegram_chats TO authenticated;
GRANT ALL ON public.telegram_chats TO service_role;
ALTER TABLE public.telegram_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tg_chats_own_select" ON public.telegram_chats FOR SELECT TO authenticated
  USING (public.telegram_account_e_minha(telegram_account_id));
CREATE INDEX idx_tg_chats_account_last ON public.telegram_chats (telegram_account_id, last_message_at DESC);
CREATE TRIGGER telegram_chats_set_updated_at BEFORE UPDATE ON public.telegram_chats
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
REVOKE SELECT (access_hash) ON public.telegram_chats FROM authenticated;

-- MESSAGES
CREATE TABLE public.telegram_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.telegram_chats(id) ON DELETE CASCADE,
  telegram_chat_id bigint NOT NULL,
  telegram_message_id bigint,
  sender_telegram_user_id bigint,
  sender_name text,
  direction text NOT NULL DEFAULT 'in',
  message_type text NOT NULL DEFAULT 'text',
  content text,
  media_url text,
  reply_to_message_id bigint,
  status text NOT NULL DEFAULT 'enviada',
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_chat_id, telegram_message_id)
);
GRANT SELECT ON public.telegram_messages TO authenticated;
GRANT ALL ON public.telegram_messages TO service_role;
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tg_messages_own_select" ON public.telegram_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.telegram_chats c
                 WHERE c.id = telegram_messages.chat_id
                   AND public.telegram_account_e_minha(c.telegram_account_id)));
CREATE INDEX idx_tg_messages_chat_sent ON public.telegram_messages (chat_id, sent_at DESC);
CREATE TRIGGER telegram_messages_set_updated_at BEFORE UPDATE ON public.telegram_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.telegram_chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.telegram_messages;
ALTER TABLE public.telegram_chats REPLICA IDENTITY FULL;
ALTER TABLE public.telegram_messages REPLICA IDENTITY FULL;