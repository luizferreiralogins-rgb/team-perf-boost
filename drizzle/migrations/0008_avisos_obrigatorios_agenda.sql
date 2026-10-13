ALTER TABLE public.tarefas ADD COLUMN exige_leitura boolean NOT NULL DEFAULT false;
CREATE FUNCTION public.tg_tarefa_exigir_leitura() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.exige_leitura := public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'lider_pap');
  ELSE
    NEW.exige_leitura := OLD.exige_leitura;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER tarefa_exigir_leitura BEFORE INSERT OR UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public.tg_tarefa_exigir_leitura();
CREATE TABLE public.tarefa_leituras (
 tarefa_id uuid NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 agendado_em timestamptz NOT NULL,
 lido_em timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tarefa_id,user_id,agendado_em)
);
GRANT SELECT ON public.tarefa_leituras TO authenticated;
GRANT ALL ON public.tarefa_leituras TO service_role;
ALTER TABLE public.tarefa_leituras ENABLE ROW LEVEL SECURITY;
CREATE POLICY leitura_propria ON public.tarefa_leituras FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE FUNCTION public.listar_avisos_tarefas() RETURNS TABLE (
 id uuid, titulo text, descricao text, cliente_nome text, prioridade text,
 agendado_em timestamptz, agora timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT t.id,t.titulo,t.descricao,t.cliente_nome,t.prioridade::text,
 (t.data_venc + COALESCE(t.hora_venc,'00:00'::time)) AT TIME ZONE 'America/Sao_Paulo',now()
 FROM public.tarefas t
 WHERE auth.uid() IS NOT NULL AND t.exige_leitura AND t.status IN ('pendente','iniciada')
 AND (t.responsavel_id = auth.uid() OR EXISTS (
   SELECT 1 FROM public.tarefa_participantes p WHERE p.tarefa_id=t.id AND p.user_id=auth.uid() AND p.status IN ('pendente','iniciada')
 ))
 AND NOT EXISTS (SELECT 1 FROM public.tarefa_leituras l WHERE l.tarefa_id=t.id AND l.user_id=auth.uid()
   AND l.agendado_em=(t.data_venc + COALESCE(t.hora_venc,'00:00'::time)) AT TIME ZONE 'America/Sao_Paulo')
 ORDER BY t.data_venc,t.hora_venc NULLS FIRST,t.id LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.listar_avisos_tarefas() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.listar_avisos_tarefas() TO authenticated;
CREATE FUNCTION public.confirmar_leitura_tarefa(_tarefa_id uuid,_agendado_em timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.listar_avisos_tarefas() a WHERE a.id=_tarefa_id AND a.agendado_em=_agendado_em AND a.agendado_em<=now()
 ) THEN
   RAISE EXCEPTION 'Aviso indisponível ou ainda não agendado para este horário';
 END IF;
 INSERT INTO public.tarefa_leituras(tarefa_id,user_id,agendado_em) VALUES(_tarefa_id,auth.uid(),_agendado_em) ON CONFLICT DO NOTHING;
END; $$;
REVOKE ALL ON FUNCTION public.confirmar_leitura_tarefa(uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirmar_leitura_tarefa(uuid,timestamptz) TO authenticated;
COMMENT ON COLUMN public.tarefas.exige_leitura IS 'Definido pelo banco para novas tarefas de Gerentes/Líder PAP; leitura não altera a conclusão. Horários em America/Sao_Paulo.';