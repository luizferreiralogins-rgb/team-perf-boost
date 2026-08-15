CREATE OR REPLACE FUNCTION public.ranking_time(_mes_ref date, _usar_ativas boolean)
RETURNS TABLE (
  id uuid,
  nome text,
  comissao numeric,
  bl_qtd numeric,
  mv_qtd numeric,
  renov_qtd numeric,
  renov_rs numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT p.id, p.gerente_id FROM public.profiles p WHERE p.id = auth.uid()
  ),
  time_ids AS (
    SELECT p.id, p.nome
    FROM public.profiles p, me
    WHERE p.ativo = true
      AND me.gerente_id IS NOT NULL
      AND p.gerente_id = me.gerente_id
    UNION
    SELECT p.id, p.nome FROM public.profiles p WHERE p.id = auth.uid()
  ),
  loja AS (
    SELECT v.vendedor_id,
      CASE WHEN v.status = 'instalado' THEN COALESCE(v.comissao,0) ELSE 0 END AS com,
      CASE WHEN v.tecnologia ~* 'banda\s*larga|fibra|fttx|internet'
            AND NOT COALESCE(v.classe_protocolo,'') LIKE 'Renovação%' THEN 1 ELSE 0 END AS bl,
      CASE WHEN v.tecnologia ~* 'm[óo]vel|celular|5g|4g' OR v.contem_movel OR COALESCE(v.qtd_linhas,0) > 0
            THEN COALESCE(v.qtd_linhas,0) ELSE 0 END AS mv,
      CASE WHEN COALESCE(v.classe_protocolo,'') LIKE 'Renovação%' THEN 1 ELSE 0 END AS rq,
      CASE WHEN COALESCE(v.classe_protocolo,'') LIKE 'Renovação%'
            THEN CASE WHEN COALESCE(v.valor_antigo,0) > 0 THEN COALESCE(v.valor_novo,0) - COALESCE(v.valor_antigo,0) ELSE COALESCE(v.valor_novo,0) END
            ELSE 0 END AS rr
    FROM public.vendas_loja v
    WHERE v.vendedor_id IN (SELECT t.id FROM time_ids t)
      AND ((_usar_ativas AND v.arquivada_em IS NULL) OR (NOT _usar_ativas AND v.mes_ref = _mes_ref))
  ),
  pap AS (
    SELECT v.vendedor_id,
      CASE WHEN v.status = 'instalado' THEN COALESCE(v.comissao,0) ELSE 0 END AS com,
      CASE WHEN (COALESCE(v.produto,'') || ' ' || COALESCE(v.tecnologia,'')) ~* 'banda\s*larga|fibra|fttx|internet'
            AND NOT COALESCE(v.tipo_protocolo,'') LIKE 'Renovação%' THEN 1 ELSE 0 END AS bl,
      CASE WHEN (COALESCE(v.produto,'') || ' ' || COALESCE(v.tecnologia,'')) ~* 'm[óo]vel|celular|5g|4g' OR COALESCE(v.qtd_linhas,0) > 0
            THEN COALESCE(v.qtd_linhas,0) ELSE 0 END AS mv,
      CASE WHEN COALESCE(v.tipo_protocolo,'') LIKE 'Renovação%' THEN 1 ELSE 0 END AS rq,
      CASE WHEN COALESCE(v.tipo_protocolo,'') LIKE 'Renovação%'
            THEN CASE WHEN COALESCE(v.valor_antigo,0) > 0 THEN COALESCE(NULLIF(v.valor_novo,0), v.valor) - COALESCE(v.valor_antigo,0) ELSE COALESCE(NULLIF(v.valor_novo,0), v.valor) END
            ELSE 0 END AS rr
    FROM public.vendas_pap v
    WHERE v.vendedor_id IN (SELECT t.id FROM time_ids t)
      AND ((_usar_ativas AND v.arquivada_em IS NULL) OR (NOT _usar_ativas AND v.mes_ref = _mes_ref))
  ),
  tudo AS (SELECT * FROM loja UNION ALL SELECT * FROM pap)
  SELECT t.id, t.nome,
    COALESCE(SUM(x.com),0), COALESCE(SUM(x.bl),0), COALESCE(SUM(x.mv),0),
    COALESCE(SUM(x.rq),0), COALESCE(SUM(x.rr),0)
  FROM time_ids t
  LEFT JOIN tudo x ON x.vendedor_id = t.id
  GROUP BY t.id, t.nome;
$$;

GRANT EXECUTE ON FUNCTION public.ranking_time(date, boolean) TO authenticated;