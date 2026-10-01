CREATE TABLE public.whatsapp_contas (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number_id text NOT NULL UNIQUE,
  numero_exibicao text,
  access_token_enc text NOT NULL,
  app_secret_enc text NOT NULL,
  verify_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16),'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_contas TO service_role;
ALTER TABLE public.whatsapp_contas ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER whatsapp_contas_updated BEFORE UPDATE ON public.whatsapp_contas FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();