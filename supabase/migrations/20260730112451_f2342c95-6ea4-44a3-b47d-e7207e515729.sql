ALTER TABLE public.vendas_pap
  ADD COLUMN IF NOT EXISTS protocolo text,
  ADD COLUMN IF NOT EXISTS tipo_protocolo text;