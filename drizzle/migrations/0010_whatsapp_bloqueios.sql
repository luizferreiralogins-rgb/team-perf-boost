CREATE TABLE public.whatsapp_bloqueios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  inicio timestamptz NOT NULL DEFAULT now(),
  fim timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX whatsapp_bloqueios_um_aberto ON public.whatsapp_bloqueios(user_id) WHERE fim IS NULL;
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_bloqueios TO authenticated;
GRANT ALL ON public.whatsapp_bloqueios TO service_role;
ALTER TABLE public.whatsapp_bloqueios ENABLE ROW LEVEL SECURITY;
CREATE POLICY wb_select ON public.whatsapp_bloqueios FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_gestor_de(auth.uid(), user_id)
    OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'regional'));
CREATE POLICY wb_insert ON public.whatsapp_bloqueios FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY wb_update ON public.whatsapp_bloqueios FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());