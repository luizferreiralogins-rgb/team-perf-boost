CREATE TYPE public.tipo_atendimento AS ENUM ('pagamento','boleto','suporte','cancelamento','duvida','entrega_equipamento','reclamacao','ativacao_configuracao','retirada_chip');

CREATE TABLE public.atendimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  nome_cliente text NOT NULL,
  tipo public.tipo_atendimento NOT NULL,
  contato_cliente text,
  observacoes text,
  data_atendimento date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atendimentos TO authenticated;
GRANT ALL ON public.atendimentos TO service_role;

ALTER TABLE public.atendimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY atendimentos_owner_all ON public.atendimentos FOR ALL TO authenticated
  USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());

CREATE POLICY atendimentos_manager_read ON public.atendimentos FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'regional'::public.app_role)
    OR (public.has_role(auth.uid(),'gerente'::public.app_role) AND public.is_gestor_de(auth.uid(), usuario_id))
  );

CREATE INDEX atendimentos_usuario_data_idx ON public.atendimentos (usuario_id, data_atendimento);

CREATE TRIGGER atendimentos_set_updated_at BEFORE UPDATE ON public.atendimentos
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();