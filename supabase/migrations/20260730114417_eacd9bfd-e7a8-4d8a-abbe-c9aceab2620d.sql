-- Gestores podem editar/excluir vendas do time
CREATE POLICY vendas_loja_manager_update ON public.vendas_loja
FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'regional'::app_role) OR (has_role(auth.uid(),'gerente'::app_role) AND is_gestor_de(auth.uid(), vendedor_id)))
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'regional'::app_role) OR (has_role(auth.uid(),'gerente'::app_role) AND is_gestor_de(auth.uid(), vendedor_id)));

CREATE POLICY vendas_loja_manager_delete ON public.vendas_loja
FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'regional'::app_role) OR (has_role(auth.uid(),'gerente'::app_role) AND is_gestor_de(auth.uid(), vendedor_id)));

CREATE POLICY vendas_pap_manager_update ON public.vendas_pap
FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'regional'::app_role) OR (has_role(auth.uid(),'gerente'::app_role) AND is_gestor_de(auth.uid(), vendedor_id)))
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'regional'::app_role) OR (has_role(auth.uid(),'gerente'::app_role) AND is_gestor_de(auth.uid(), vendedor_id)));

CREATE POLICY vendas_pap_manager_delete ON public.vendas_pap
FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'regional'::app_role) OR (has_role(auth.uid(),'gerente'::app_role) AND is_gestor_de(auth.uid(), vendedor_id)));

-- Transferência de venda entre consultores
CREATE OR REPLACE FUNCTION public.transferir_venda(_tabela text, _venda_id uuid, _para uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dono uuid;
  pode boolean;
BEGIN
  IF _tabela NOT IN ('vendas_loja','vendas_pap') THEN
    RAISE EXCEPTION 'Tabela inválida';
  END IF;

  IF _tabela = 'vendas_loja' THEN
    SELECT vendedor_id INTO dono FROM public.vendas_loja WHERE id = _venda_id;
  ELSE
    SELECT vendedor_id INTO dono FROM public.vendas_pap WHERE id = _venda_id;
  END IF;

  IF dono IS NULL THEN RAISE EXCEPTION 'Venda não encontrada'; END IF;

  pode := dono = auth.uid()
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'regional'::public.app_role)
    OR (public.has_role(auth.uid(),'gerente'::public.app_role) AND public.is_gestor_de(auth.uid(), dono));

  IF NOT pode THEN RAISE EXCEPTION 'Sem permissão para transferir esta venda'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _para AND ativo) THEN
    RAISE EXCEPTION 'Destinatário inválido';
  END IF;

  IF _tabela = 'vendas_loja' THEN
    UPDATE public.vendas_loja SET vendedor_id = _para WHERE id = _venda_id;
  ELSE
    UPDATE public.vendas_pap SET vendedor_id = _para WHERE id = _venda_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.transferir_venda(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferir_venda(text, uuid, uuid) TO authenticated;