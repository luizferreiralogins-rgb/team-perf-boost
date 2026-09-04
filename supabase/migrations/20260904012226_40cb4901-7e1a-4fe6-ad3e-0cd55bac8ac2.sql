alter table public.estrategico_mensal
  add column if not exists churn_geral numeric,
  add column if not exists ativacoes_liquidas numeric,
  add column if not exists net_ads numeric,
  add column if not exists mv_churn_geral numeric,
  add column if not exists mv_ativacoes_liquidas numeric,
  add column if not exists mv_net_ads numeric;