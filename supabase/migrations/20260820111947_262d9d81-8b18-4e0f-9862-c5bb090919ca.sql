CREATE OR REPLACE FUNCTION public.proximo_aniversariante()
RETURNS TABLE(id uuid, nome text, dias_faltando integer, sou_eu boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT p.id, p.gerente_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
  ),
  hoje AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS data_hoje
  ),
  equipe AS (
    SELECT DISTINCT p.id, p.nome, p.data_nascimento
    FROM public.profiles p, me, hoje
    WHERE auth.uid() IS NOT NULL
      AND p.ativo
      AND p.data_nascimento IS NOT NULL
      AND (
        p.id = me.id
        OR (me.gerente_id IS NOT NULL AND p.gerente_id = me.gerente_id)
        OR p.gerente_id = me.id
        OR public.is_gestor_de(me.id, p.id)
      )
  ),
  proximos AS (
    SELECT
      e.id,
      e.nome,
      (e.id = auth.uid()) AS sou_eu,
      make_date(
        extract(year from hoje.data_hoje)::int,
        extract(month from e.data_nascimento)::int,
        extract(day from e.data_nascimento)::int
      ) AS aniversario_ano_atual,
      hoje.data_hoje
    FROM equipe e, hoje
    WHERE to_char(e.data_nascimento, 'MM-DD') <> to_char(hoje.data_hoje, 'MM-DD')
  )
  SELECT
    p.id,
    p.nome,
    CASE
      WHEN p.aniversario_ano_atual >= p.data_hoje
        THEN (p.aniversario_ano_atual - p.data_hoje)::int
      ELSE ((p.aniversario_ano_atual + interval '1 year')::date - p.data_hoje)::int
    END AS dias_faltando,
    p.sou_eu
  FROM proximos p
  ORDER BY dias_faltando ASC, p.nome ASC
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.proximo_aniversariante() IS 'Retorna o próximo membro da equipe a fazer aniversário, com dias restantes e flag se é o usuário logado.';