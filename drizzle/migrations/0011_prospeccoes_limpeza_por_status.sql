CREATE OR REPLACE FUNCTION public.limpar_prospeccoes_por_status(_status text[], _sem_status boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('gerente','lider_pap','gerente_regional','regional','admin')
  ) THEN
    RAISE EXCEPTION 'Apenas gestores podem limpar a base.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(cardinality(_status), 0) = 0 AND NOT coalesce(_sem_status, false) THEN
    RAISE EXCEPTION 'Selecione ao menos um status para remover.' USING ERRCODE = '22023';
  END IF;
  WITH alvo AS (
    DELETE FROM public.prospeccoes p
    WHERE (p.gerente_id = auth.uid() OR public.is_gestor_de(auth.uid(), p.vendedor_id)
      OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'regional'))
      AND (p.status = ANY(coalesce(_status, ARRAY[]::text[]))
        OR (coalesce(_sem_status, false) AND p.status IS NULL))
    RETURNING p.*
  ), ins AS (
    INSERT INTO public.prospeccoes_historico(vendedor_id, gerente_id, nome_cliente, cpf_cnpj, telefone, status, data_contato, observacao)
    SELECT vendedor_id, gerente_id, nome_cliente, cpf_cnpj, telefone, status, data_contato, observacao FROM alvo
    RETURNING 1
  )
  SELECT count(*) INTO n FROM ins;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.limpar_prospeccoes_por_status(text[], boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.limpar_prospeccoes_por_status(text[], boolean) TO authenticated;