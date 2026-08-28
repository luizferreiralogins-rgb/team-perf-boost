ALTER TABLE public.parametros_loja_faixas_ticket DROP COLUMN IF EXISTS faixa_0;

ALTER TABLE public.parametros_loja_novos_produtos
  ADD COLUMN IF NOT EXISTS limitado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS limite numeric NOT NULL DEFAULT 0;

UPDATE public.parametros_loja_novos_produtos SET nome = 'Unifique Seguro Residencial' WHERE codigo = '13.01';

UPDATE public.parametros_loja_novos_produtos
  SET limitado = true, limite = 5000
  WHERE codigo IN ('10.01','13.01','15.01');

UPDATE public.parametros_loja_novos_produtos SET limitado = false, limite = 0 WHERE codigo IN ('12.01','14.04');

INSERT INTO public.parametros_loja_novos_produtos (codigo, nome, percentual, limitado, limite)
VALUES ('14.05', 'Retenção Móvel', 0.08, false, 0)
ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome, percentual = EXCLUDED.percentual;