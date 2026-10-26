ALTER TABLE public.prospeccoes ADD COLUMN protocolo text;
COMMENT ON COLUMN public.prospeccoes.item IS 'DEPRECATED: not used by the Assyst prospect layout or importer';