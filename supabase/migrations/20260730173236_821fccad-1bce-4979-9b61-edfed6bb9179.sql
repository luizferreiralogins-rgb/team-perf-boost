CREATE TABLE public.mensagens_chat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remetente_id uuid NOT NULL,
  destinatario_id uuid NOT NULL,
  texto text NOT NULL,
  lida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mensagens_chat_par ON public.mensagens_chat (remetente_id, destinatario_id, created_at DESC);
CREATE INDEX idx_mensagens_chat_dest ON public.mensagens_chat (destinatario_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.mensagens_chat TO authenticated;
GRANT ALL ON public.mensagens_chat TO service_role;

ALTER TABLE public.mensagens_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_select_participante" ON public.mensagens_chat
  FOR SELECT TO authenticated
  USING (auth.uid() = remetente_id OR auth.uid() = destinatario_id);

CREATE POLICY "chat_insert_proprio" ON public.mensagens_chat
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = remetente_id);

CREATE POLICY "chat_update_destinatario" ON public.mensagens_chat
  FOR UPDATE TO authenticated
  USING (auth.uid() = destinatario_id)
  WITH CHECK (auth.uid() = destinatario_id);

DROP TABLE IF EXISTS public.telegram_mensagens;
DROP TABLE IF EXISTS public.telegram_vinculos;