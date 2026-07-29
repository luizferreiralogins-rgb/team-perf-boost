
CREATE TYPE public.lead_status AS ENUM ('contato_feito','negociando','desistiu','fechou','nao_perturbar','transferido');
CREATE TYPE public.transfer_status AS ENUM ('pendente','aceita','recusada','cancelada');

CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendedor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cidade TEXT,
  fonte TEXT,
  email TEXT,
  whatsapp TEXT,
  produto_interesse TEXT,
  status public.lead_status NOT NULL DEFAULT 'contato_feito',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX leads_vendedor_idx ON public.leads(vendedor_id);
CREATE INDEX leads_email_idx ON public.leads(lower(email));
CREATE INDEX leads_whatsapp_idx ON public.leads(regexp_replace(coalesce(whatsapp,''), '\D', '', 'g'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY leads_owner_all ON public.leads
  FOR ALL TO authenticated
  USING (vendedor_id = auth.uid())
  WITH CHECK (vendedor_id = auth.uid());

CREATE POLICY leads_manager_read ON public.leads
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'regional'::public.app_role)
    OR (public.has_role(auth.uid(), 'gerente'::public.app_role) AND public.is_gestor_de(auth.uid(), vendedor_id))
  );

CREATE TRIGGER leads_set_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.lead_transferencias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_user UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.transfer_status NOT NULL DEFAULT 'pendente',
  mensagem TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lt_to_idx ON public.lead_transferencias(to_user, status);
CREATE INDEX lt_from_idx ON public.lead_transferencias(from_user, status);
CREATE INDEX lt_lead_idx ON public.lead_transferencias(lead_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_transferencias TO authenticated;
GRANT ALL ON public.lead_transferencias TO service_role;
ALTER TABLE public.lead_transferencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY lt_read ON public.lead_transferencias
  FOR SELECT TO authenticated
  USING (
    from_user = auth.uid() OR to_user = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'regional'::public.app_role)
  );

CREATE POLICY lt_create ON public.lead_transferencias
  FOR INSERT TO authenticated
  WITH CHECK (from_user = auth.uid());

CREATE POLICY lt_update_receiver ON public.lead_transferencias
  FOR UPDATE TO authenticated
  USING (to_user = auth.uid() OR from_user = auth.uid())
  WITH CHECK (to_user = auth.uid() OR from_user = auth.uid());

CREATE TRIGGER lt_set_updated_at BEFORE UPDATE ON public.lead_transferencias
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Aceitar transferência: função security definer que troca o dono do lead
CREATE OR REPLACE FUNCTION public.aceitar_transferencia_lead(_transfer_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.lead_transferencias;
BEGIN
  SELECT * INTO t FROM public.lead_transferencias WHERE id = _transfer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transferência não encontrada'; END IF;
  IF t.to_user <> auth.uid() THEN RAISE EXCEPTION 'Você não é o destinatário'; END IF;
  IF t.status <> 'pendente' THEN RAISE EXCEPTION 'Transferência já processada'; END IF;

  UPDATE public.leads SET vendedor_id = t.to_user, status = 'contato_feito' WHERE id = t.lead_id;
  UPDATE public.lead_transferencias SET status = 'aceita' WHERE id = t.id;
  -- Marca o lead antigo do from_user (se houver duplicado) como transferido
  UPDATE public.leads SET status = 'transferido'
    WHERE vendedor_id = t.from_user AND id <> t.lead_id
      AND (
        (email IS NOT NULL AND email = (SELECT email FROM public.leads WHERE id = t.lead_id))
        OR (whatsapp IS NOT NULL AND whatsapp = (SELECT whatsapp FROM public.leads WHERE id = t.lead_id))
      );
END;
$$;

REVOKE ALL ON FUNCTION public.aceitar_transferencia_lead(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aceitar_transferencia_lead(UUID) TO authenticated;
