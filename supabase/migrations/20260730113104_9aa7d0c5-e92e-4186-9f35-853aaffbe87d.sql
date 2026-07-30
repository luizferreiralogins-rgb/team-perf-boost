CREATE TABLE public.atalhos_externos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,
  nome text NOT NULL,
  url text,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atalhos_externos TO authenticated;
GRANT ALL ON public.atalhos_externos TO service_role;

ALTER TABLE public.atalhos_externos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "atalhos_read" ON public.atalhos_externos FOR SELECT TO authenticated USING (true);
CREATE POLICY "atalhos_manage" ON public.atalhos_externos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'regional'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'regional'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER atalhos_externos_set_updated_at BEFORE UPDATE ON public.atalhos_externos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.atalhos_externos (chave, nome, url, ordem) VALUES
  ('bemtevi', 'Bemtevi', NULL, 1),
  ('fenix', 'Fenix', NULL, 2),
  ('falcon', 'Falcon', NULL, 3),
  ('assyst', 'Assyst', NULL, 4),
  ('blog', 'Blog', NULL, 5);