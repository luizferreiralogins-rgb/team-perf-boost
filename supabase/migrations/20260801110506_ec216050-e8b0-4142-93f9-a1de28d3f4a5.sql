ALTER TABLE public.vendas_loja ADD COLUMN IF NOT EXISTS arquivada_em timestamptz;
ALTER TABLE public.vendas_pap ADD COLUMN IF NOT EXISTS arquivada_em timestamptz;
CREATE INDEX IF NOT EXISTS idx_vendas_loja_arquivada ON public.vendas_loja (vendedor_id, arquivada_em);
CREATE INDEX IF NOT EXISTS idx_vendas_pap_arquivada ON public.vendas_pap (vendedor_id, arquivada_em);