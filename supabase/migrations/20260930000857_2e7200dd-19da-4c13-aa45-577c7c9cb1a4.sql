CREATE TABLE public.whatsapp_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendedor_id uuid NOT NULL REFERENCES auth.users(id),
  telefone text NOT NULL,
  nome_contato text,
  ultima_mensagem text,
  ultima_mensagem_em timestamptz,
  nao_lidas integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendedor_id, telefone)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_conversations TO authenticated;
GRANT ALL ON public.whatsapp_conversations TO service_role;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dono e gestores veem conversas" ON public.whatsapp_conversations FOR SELECT TO authenticated USING (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'regional') OR public.has_role(auth.uid(), 'gerente_regional') OR public.is_gestor_de(auth.uid(), vendedor_id));
CREATE POLICY "dono e gestores atualizam conversas" ON public.whatsapp_conversations FOR UPDATE TO authenticated USING (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.is_gestor_de(auth.uid(), vendedor_id));

CREATE TABLE public.whatsapp_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  provider_message_id text,
  direcao text NOT NULL CHECK (direcao IN ('enviada', 'recebida')),
  tipo text NOT NULL DEFAULT 'texto',
  conteudo text,
  media_id text,
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'sent', 'delivered', 'read', 'failed')),
  erro text,
  enviada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, provider_message_id)
);
CREATE INDEX whatsapp_messages_conversation_idx ON public.whatsapp_messages (conversation_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dono e gestores veem mensagens" ON public.whatsapp_messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.whatsapp_conversations c WHERE c.id = conversation_id AND (c.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'regional') OR public.has_role(auth.uid(), 'gerente_regional') OR public.is_gestor_de(auth.uid(), c.vendedor_id))));
CREATE POLICY "dono e gestores atualizam mensagens" ON public.whatsapp_messages FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.whatsapp_conversations c WHERE c.id = conversation_id AND (c.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.is_gestor_de(auth.uid(), c.vendedor_id))));

CREATE TABLE public.whatsapp_webhook_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_id text NOT NULL UNIQUE,
  event text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);
GRANT SELECT ON public.whatsapp_webhook_events TO authenticated;
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gestores veem eventos" ON public.whatsapp_webhook_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'regional') OR public.has_role(auth.uid(), 'gerente_regional'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;