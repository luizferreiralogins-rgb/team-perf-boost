CREATE OR REPLACE FUNCTION public.planejamento_resumo_pap(_mes date)
 RETURNS TABLE(data date, consultor_id uuid, consultor_nome text, leads integer, bl integer, movel integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH escopo AS (
    SELECT p.id, p.nome
    FROM public.profiles p
    WHERE auth.uid() IS NOT NULL
      AND (
        p.id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'regional'::public.app_role)
        OR public.is_gestor_de(auth.uid(), p.id)
      )
  ),
  ld AS (
    SELECT l.data, l.consultor_id, l.leads
    FROM public.planejamento_leads_diarios l
    JOIN escopo e ON e.id = l.consultor_id
    WHERE date_trunc('month', l.data) = date_trunc('month', _mes)
  ),
  vd AS (
    SELECT v.data_venda AS data, v.vendedor_id AS consultor_id,
      SUM(CASE
            WHEN (COALESCE(v.produto,'') || ' ' || COALESCE(v.tecnologia,'')) ~* 'banda\s*larga|fibra|fttx|internet'
             AND NOT COALESCE(v.tipo_protocolo,'') LIKE 'Renovação%'
            THEN 1 ELSE 0 END)::int AS bl,
      SUM(COALESCE(v.qtd_linhas,0))::int AS movel
    FROM public.vendas_pap v
    JOIN escopo e ON e.id = v.vendedor_id
    WHERE date_trunc('month', v.data_venda) = date_trunc('month', _mes)
      AND v.arquivada_em IS NULL
    GROUP BY 1, 2
  ),
  chaves AS (
    SELECT data, consultor_id FROM ld
    UNION
    SELECT data, consultor_id FROM vd
  )
  SELECT k.data, k.consultor_id, e.nome,
    COALESCE(ld.leads, 0)::int,
    COALESCE(vd.bl, 0)::int,
    COALESCE(vd.movel, 0)::int
  FROM chaves k
  JOIN escopo e ON e.id = k.consultor_id
  LEFT JOIN ld ON ld.data = k.data AND ld.consultor_id = k.consultor_id
  LEFT JOIN vd ON vd.data = k.data AND vd.consultor_id = k.consultor_id
  ORDER BY 1, 3;
$function$;