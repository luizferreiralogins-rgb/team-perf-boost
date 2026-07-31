-- 1. Revoke public/anon execute on SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.consultor_ve_nativa(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_gestor_regras(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consultor_ve_nativa(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_gestor_regras(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.aceitar_transferencia_lead(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buscar_lead_duplicado(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expirar_leads_sem_contato() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_canal(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_gestor_de(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.listar_destinatarios_venda() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.listar_usuarios_tarefas() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pode_gerenciar(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transferir_venda(text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.nome_chave(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_dias_uteis(date, integer) FROM PUBLIC, anon;

-- 2. Guard inside the bulk mutation function
CREATE OR REPLACE FUNCTION public.expirar_leads_sem_contato()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;
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
END; $function$;
REVOKE ALL ON FUNCTION public.expirar_leads_sem_contato() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expirar_leads_sem_contato() TO authenticated, service_role;

-- 3. Prevent self privilege changes on user_roles
DROP POLICY IF EXISTS user_roles_gerente_manage_consultor ON public.user_roles;
CREATE POLICY user_roles_gerente_manage_consultor ON public.user_roles
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'gerente'::public.app_role)
  AND user_id <> auth.uid()
  AND role = 'consultor'::public.app_role
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_roles.user_id AND p.gerente_id = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'gerente'::public.app_role)
  AND user_id <> auth.uid()
  AND role = 'consultor'::public.app_role
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_roles.user_id AND p.gerente_id = auth.uid())
);

DROP POLICY IF EXISTS user_roles_regional_manage ON public.user_roles;
CREATE POLICY user_roles_regional_manage ON public.user_roles
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'regional'::public.app_role)
  AND user_id <> auth.uid()
  AND role = ANY (ARRAY['gerente'::public.app_role, 'consultor'::public.app_role])
)
WITH CHECK (
  public.has_role(auth.uid(), 'regional'::public.app_role)
  AND user_id <> auth.uid()
  AND role = ANY (ARRAY['gerente'::public.app_role, 'consultor'::public.app_role])
);

-- 4. Explicit granular policies for atalhos_externos
DROP POLICY IF EXISTS atalhos_manage ON public.atalhos_externos;
CREATE POLICY atalhos_insert ON public.atalhos_externos
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'regional'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY atalhos_update ON public.atalhos_externos
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'regional'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(),'regional'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY atalhos_delete ON public.atalhos_externos
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'regional'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role));

-- 5. parametros_versoes: allow append-only inserts by regional/admin, no update/delete
CREATE POLICY parametros_versoes_insert_gestor ON public.parametros_versoes
FOR INSERT TO authenticated
WITH CHECK (
  aplicado_por = auth.uid()
  AND (public.has_role(auth.uid(),'regional'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role))
);