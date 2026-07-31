CREATE OR REPLACE FUNCTION public.consultor_ve_nativa(_consultor_nome text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH alvo AS (
    SELECT public.nome_chave(split_part(btrim(coalesce(_consultor_nome,'')), ' ', 1)) AS k
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p, alvo a
    WHERE p.id = auth.uid()
      AND a.k <> ''
      AND public.nome_chave(split_part(btrim(p.nome), ' ', 1)) <> ''
      AND a.k LIKE public.nome_chave(split_part(btrim(p.nome), ' ', 1)) || '%'
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles q
        WHERE q.id <> p.id
          AND public.nome_chave(split_part(btrim(q.nome), ' ', 1)) <> ''
          AND a.k LIKE public.nome_chave(split_part(btrim(q.nome), ' ', 1)) || '%'
          AND length(public.nome_chave(split_part(btrim(q.nome), ' ', 1)))
              > length(public.nome_chave(split_part(btrim(p.nome), ' ', 1)))
      )
  )
$function$;

REVOKE EXECUTE ON FUNCTION public.consultor_ve_nativa(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consultor_ve_nativa(text) TO authenticated;