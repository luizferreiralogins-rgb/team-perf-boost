CREATE OR REPLACE FUNCTION public.nome_chave(_t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT upper(regexp_replace(
    translate(coalesce(_t,''),
      'àáâãäåèéêëìíîïòóôõöùúûüçñÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÑ',
      'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN'),
    '[^a-zA-Z0-9]', '', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.consultor_ve_nativa(_consultor_nome text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND public.nome_chave(p.nome) <> ''
      AND public.nome_chave(_consultor_nome) = public.nome_chave(p.nome)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.nome_chave(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.consultor_ve_nativa(text) FROM anon;

CREATE POLICY "cvn_select_proprio" ON public.contestacao_vendas_nativas
FOR SELECT TO authenticated
USING (public.consultor_ve_nativa(consultor_nome));