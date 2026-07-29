
CREATE OR REPLACE FUNCTION public.buscar_lead_duplicado(_email TEXT, _whatsapp TEXT)
RETURNS TABLE(lead_id UUID, vendedor_id UUID, vendedor_nome TEXT, nome TEXT, email TEXT, whatsapp TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.vendedor_id, p.nome, l.nome, l.email, l.whatsapp
  FROM public.leads l
  JOIN public.profiles p ON p.id = l.vendedor_id
  WHERE l.vendedor_id <> auth.uid()
    AND l.status NOT IN ('transferido','desistiu','nao_perturbar')
    AND (
      (_email IS NOT NULL AND _email <> '' AND lower(l.email) = lower(_email))
      OR (
        _whatsapp IS NOT NULL AND _whatsapp <> ''
        AND regexp_replace(coalesce(l.whatsapp,''), '\D', '', 'g') = regexp_replace(_whatsapp, '\D', '', 'g')
        AND regexp_replace(_whatsapp, '\D', '', 'g') <> ''
      )
    )
  LIMIT 5;
$$;

REVOKE ALL ON FUNCTION public.buscar_lead_duplicado(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buscar_lead_duplicado(TEXT, TEXT) TO authenticated;
