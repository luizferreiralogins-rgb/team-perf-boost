ALTER TABLE public.vendas_pap
  ADD COLUMN IF NOT EXISTS valor_novo numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_antigo numeric NOT NULL DEFAULT 0;

UPDATE public.vendas_pap SET valor_novo = valor WHERE valor_novo = 0;