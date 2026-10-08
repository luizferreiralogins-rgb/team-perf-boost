CREATE OR REPLACE VIEW public.prospeccoes_categorias
WITH (security_invoker = on)
AS
SELECT categoria
FROM public.prospeccoes
WHERE categoria IS NOT NULL AND btrim(categoria) <> ''
GROUP BY categoria
ORDER BY categoria;

GRANT SELECT ON public.prospeccoes_categorias TO authenticated;
GRANT ALL ON public.prospeccoes_categorias TO service_role;