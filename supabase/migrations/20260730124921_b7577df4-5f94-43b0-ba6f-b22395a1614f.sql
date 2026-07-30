ALTER TABLE public.vendas_loja
  ADD COLUMN IF NOT EXISTS data_agendamento date,
  ADD COLUMN IF NOT EXISTS agendamento_adiamentos integer NOT NULL DEFAULT 0;

ALTER TABLE public.vendas_pap
  ADD COLUMN IF NOT EXISTS data_agendamento date,
  ADD COLUMN IF NOT EXISTS agendamento_adiamentos integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.tg_contar_adiamento_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.data_agendamento IS NOT NULL
     AND NEW.data_agendamento IS NOT NULL
     AND NEW.data_agendamento <> OLD.data_agendamento THEN
    NEW.agendamento_adiamentos := COALESCE(OLD.agendamento_adiamentos, 0) + 1;
  ELSE
    NEW.agendamento_adiamentos := COALESCE(OLD.agendamento_adiamentos, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_adiamento_vendas_loja ON public.vendas_loja;
CREATE TRIGGER tg_adiamento_vendas_loja
BEFORE UPDATE ON public.vendas_loja
FOR EACH ROW EXECUTE FUNCTION public.tg_contar_adiamento_agendamento();

DROP TRIGGER IF EXISTS tg_adiamento_vendas_pap ON public.vendas_pap;
CREATE TRIGGER tg_adiamento_vendas_pap
BEFORE UPDATE ON public.vendas_pap
FOR EACH ROW EXECUTE FUNCTION public.tg_contar_adiamento_agendamento();