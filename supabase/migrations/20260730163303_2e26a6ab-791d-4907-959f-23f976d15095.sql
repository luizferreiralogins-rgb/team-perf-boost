-- 1. dias úteis
CREATE OR REPLACE FUNCTION public.add_dias_uteis(_base date, _dias int)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE d date := _base; restantes int := _dias;
BEGIN
  WHILE restantes > 0 LOOP
    d := d + 1;
    IF EXTRACT(ISODOW FROM d) < 6 THEN restantes := restantes - 1; END IF;
  END LOOP;
  RETURN d;
END; $$;

-- 2. colunas de cadência
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS etapa_contato smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proximo_contato_em date;

-- 3. tabela de contatos
CREATE TABLE IF NOT EXISTS public.lead_contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  vendedor_id uuid NOT NULL,
  etapa smallint NOT NULL,
  prazo_dias_uteis smallint NOT NULL,
  observacao text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.lead_contatos TO authenticated;
GRANT ALL ON public.lead_contatos TO service_role;

ALTER TABLE public.lead_contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_contatos_select" ON public.lead_contatos
FOR SELECT TO authenticated
USING (
  vendedor_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'regional'::public.app_role)
  OR public.is_gestor_de(auth.uid(), vendedor_id)
);

CREATE POLICY "lead_contatos_insert_own" ON public.lead_contatos
FOR INSERT TO authenticated
WITH CHECK (
  vendedor_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.vendedor_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_lead_contatos_lead ON public.lead_contatos(lead_id, created_at DESC);

-- 4. define prazo inicial ao criar lead
CREATE OR REPLACE FUNCTION public.tg_lead_cadencia_inicial()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.etapa_contato := 0;
  NEW.proximo_contato_em := public.add_dias_uteis(CURRENT_DATE, 1);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_lead_cadencia_inicial ON public.leads;
CREATE TRIGGER trg_lead_cadencia_inicial
BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_lead_cadencia_inicial();

-- 5. avança cadência a cada apontamento
CREATE OR REPLACE FUNCTION public.tg_lead_contato_registrado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prox smallint; dias smallint;
BEGIN
  prox := NEW.etapa + 1;
  dias := CASE prox WHEN 1 THEN 5 WHEN 2 THEN 15 WHEN 3 THEN 30 ELSE NULL END;

  UPDATE public.leads
     SET etapa_contato = prox,
         proximo_contato_em = CASE WHEN dias IS NULL THEN NULL ELSE public.add_dias_uteis(CURRENT_DATE, dias) END,
         observacoes = COALESCE(observacoes || E'\n', '')
           || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
           || ' — contato ' || NEW.prazo_dias_uteis || ' dia(s) úteis: ' || NEW.observacao
   WHERE id = NEW.lead_id;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_lead_contato_registrado ON public.lead_contatos;
CREATE TRIGGER trg_lead_contato_registrado
AFTER INSERT ON public.lead_contatos
FOR EACH ROW EXECUTE FUNCTION public.tg_lead_contato_registrado();

-- 6. expiração automática -> Desistiu
CREATE OR REPLACE FUNCTION public.expirar_leads_sem_contato()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.leads
     SET status = 'desistiu'::public.lead_status,
         proximo_contato_em = NULL,
         observacoes = COALESCE(observacoes || E'\n', '')
           || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
           || ' — movido automaticamente para Desistiu: prazo de acompanhamento expirado sem novo apontamento.'
   WHERE status IN ('contato_feito'::public.lead_status, 'negociando'::public.lead_status)
     AND proximo_contato_em IS NOT NULL
     AND proximo_contato_em < CURRENT_DATE;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;

REVOKE EXECUTE ON FUNCTION public.expirar_leads_sem_contato() FROM anon;
GRANT EXECUTE ON FUNCTION public.expirar_leads_sem_contato() TO authenticated, service_role;

-- 7. backfill dos leads existentes
UPDATE public.leads
   SET proximo_contato_em = public.add_dias_uteis(created_at::date, 1)
 WHERE proximo_contato_em IS NULL
   AND status IN ('contato_feito'::public.lead_status, 'negociando'::public.lead_status);