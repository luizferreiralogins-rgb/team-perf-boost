-- 1. Lock down SECURITY DEFINER helper functions (used only inside RLS policies/triggers)
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.is_gestor_de(uuid, uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.pode_gerenciar(uuid, uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.get_canal(uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM anon, authenticated, public;

-- RPCs intentionally callable by signed-in users only
REVOKE ALL ON FUNCTION public.buscar_lead_duplicado(text, text) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.aceitar_transferencia_lead(uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.buscar_lead_duplicado(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aceitar_transferencia_lead(uuid) TO authenticated;

-- 2. lead_transferencias: sender must own the lead; allow sender to cancel/delete pending transfers
DROP POLICY IF EXISTS lt_create ON public.lead_transferencias;
CREATE POLICY lt_create ON public.lead_transferencias
  FOR INSERT TO authenticated
  WITH CHECK (
    from_user = auth.uid()
    AND to_user <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_transferencias.lead_id
        AND l.vendedor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS lt_delete_sender ON public.lead_transferencias;
CREATE POLICY lt_delete_sender ON public.lead_transferencias
  FOR DELETE TO authenticated
  USING (from_user = auth.uid() AND status = 'pendente'::public.transfer_status);

GRANT DELETE ON public.lead_transferencias TO authenticated;

-- 3. Parameter tables: read-only for signed-in users, no access for anonymous visitors
REVOKE ALL ON public.parametros_loja_faixas_ticket FROM anon, authenticated;
REVOKE ALL ON public.parametros_loja_metas FROM anon, authenticated;
REVOKE ALL ON public.parametros_loja_novos_produtos FROM anon, authenticated;
REVOKE ALL ON public.parametros_pap_faixas FROM anon, authenticated;

GRANT SELECT ON public.parametros_loja_faixas_ticket TO authenticated;
GRANT SELECT ON public.parametros_loja_metas TO authenticated;
GRANT SELECT ON public.parametros_loja_novos_produtos TO authenticated;
GRANT SELECT ON public.parametros_pap_faixas TO authenticated;

GRANT ALL ON public.parametros_loja_faixas_ticket TO service_role;
GRANT ALL ON public.parametros_loja_metas TO service_role;
GRANT ALL ON public.parametros_loja_novos_produtos TO service_role;
GRANT ALL ON public.parametros_pap_faixas TO service_role;