CREATE TABLE public.telegram_vinculos (
  user_id uuid PRIMARY KEY,
  token text NOT NULL UNIQUE,
  chat_id bigint UNIQUE,
  telegram_username text,
  telegram_nome text,
  vinculado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_vinculos TO authenticated;
GRANT ALL ON public.telegram_vinculos TO service_role;
ALTER TABLE public.telegram_vinculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY tv_owner_all ON public.telegram_vinculos FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY tv_manager_read ON public.telegram_vinculos FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'regional'::public.app_role)
    OR (public.has_role(auth.uid(), 'gerente'::public.app_role) AND public.is_gestor_de(auth.uid(), user_id))
  );

CREATE TRIGGER tv_updated_at BEFORE UPDATE ON public.telegram_vinculos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.telegram_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  chat_id bigint NOT NULL,
  direcao text NOT NULL CHECK (direcao IN ('entrada','saida')),
  texto text,
  autor text,
  update_id bigint UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_telegram_mensagens_user ON public.telegram_mensagens (user_id, created_at);

GRANT SELECT, INSERT ON public.telegram_mensagens TO authenticated;
GRANT ALL ON public.telegram_mensagens TO service_role;
ALTER TABLE public.telegram_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY tm_owner_read ON public.telegram_mensagens FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY tm_manager_read ON public.telegram_mensagens FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'regional'::public.app_role)
    OR (public.has_role(auth.uid(), 'gerente'::public.app_role) AND public.is_gestor_de(auth.uid(), user_id))
  );