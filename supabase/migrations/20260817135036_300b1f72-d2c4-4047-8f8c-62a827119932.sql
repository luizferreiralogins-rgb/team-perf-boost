ALTER TABLE public.atendimentos ALTER COLUMN tipo TYPE text USING tipo::text;

ALTER TABLE public.opcoes_canais DROP CONSTRAINT IF EXISTS opcoes_canais_tipo_check;
ALTER TABLE public.opcoes_canais ADD CONSTRAINT opcoes_canais_tipo_check CHECK (tipo IN ('venda','atendimento','produtividade'));

INSERT INTO public.opcoes_canais (tipo, nome, ordem)
SELECT 'produtividade', v.nome, v.ordem
FROM (VALUES
  ('Pagamento',1),('Boleto',2),('Suporte',3),('Cancelamento',4),('Dúvida',5),
  ('Entrega de equipamento',6),('Reclamação',7),('Ativação/Configuração',8),('Retirada de Chip',9)
) AS v(nome, ordem)
WHERE NOT EXISTS (
  SELECT 1 FROM public.opcoes_canais o WHERE o.tipo = 'produtividade' AND o.nome = v.nome
);