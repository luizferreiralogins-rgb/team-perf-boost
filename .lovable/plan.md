## Fase 1 — MVP do Sistema de Gestão Comercial Unifique

Vou entregar a fundação do sistema. Módulos avançados (Kanban, Contestação, Tarefas, Fechamento Mensal, Dashboards regionais) virão em fases seguintes.

### O que entra nesta fase

**1. Backend (Lovable Cloud)**

- Ativação do Lovable Cloud (banco + autenticação).
- Auth por e-mail/senha + Google (auto-confirm ativado).
- Tabelas:
  - `profiles` (nome, tipo canal: `loja`/`pap`, gerente_id, regional_id, ativo)
  - `user_roles` (`consultor` | `gerente` | `regional` | `admin`) — tabela separada com função `has_role()` SECURITY DEFINER
  - `vendas_loja` (campos da planilha Loja: protocolo, cliente, data abertura, data ativação, classe, contém móvel, qtd linhas, tecnologia, valor novo, valor antigo, tipo comissão, comissão R$, status)
  - `vendas_pap` (variante PAP com campos correspondentes)
  - `parametros_comissao_loja` / `parametros_comissao_pap` — tabelas de faixas extraídas das planilhas (seed via migration)
- RLS por hierarquia:
  - Consultor: só vê/edita as próprias vendas
  - Gerente: vê vendas dos consultores da sua equipe
  - Regional: vê tudo
- Trigger para auto-criar profile no signup.

**2. Frontend**

- Design system em português BR, azul corporativo Unifique, mobile-friendly (tokens em `styles.css`, sem cores hardcoded).
- Rotas públicas:
  - `/` — landing pública explicando o sistema + CTA login
  - `/auth` — login/cadastro (e-mail/senha + Google)
- Rotas autenticadas (`/_authenticated/`):
  - `/dashboard` — visão individual: total vendido no mês, comissão estimada, gráfico de evolução, últimas vendas
  - `/vendas` — lista + filtros; form de nova venda **dinâmico por canal** (Loja vs PAP) com validação Zod
  - `/vendas/nova` — cadastro
  - `/equipe` (só gerente/regional) — lista consultores/gerentes com resumo
  - `/perfil` — dados pessoais
- Cálculo de comissão no servidor (server function) usando as tabelas de parâmetros; regra: `status != 'Instalado' → comissão = 0`.
- Componentes: sidebar com nav filtrada por role, header com usuário/logout, cards de KPI, tabela sortável (shadcn).

**3. Regras de comissão extraídas das planilhas**

- **Loja**: faixas por Diferença de Ticket (0-10, 10-20, ... 100+) × Faixa efetiva (0-3) → valor de comissão em R$. Faixa efetiva definida por meta de % renovações c/móvel (0 / 0.5 / 0.7) e meta de receita ($2.5k / $5k). Bônus por novos produtos (Telemedicina 100%, Seguros 50%, etc.).
- **PAP**: faixas de receita (R$0-1500, 1500-1750, ..., até 3500+) → % sobre ativações (5% a 31%), com meta de índice de cancelamento (8%) e bônus indireta.
- Tudo em tabelas versionáveis para o admin ajustar depois.

### Fora desta fase (próximas)

Kanban de leads, Contestação de vendas, Tarefas/Agenda, Fechamento mensal, Rankings/gamificação avançada, Insights automáticos.

### Notas técnicas

- Stack: TanStack Start + Supabase (via Lovable Cloud) + Tailwind v4 + shadcn.
- Server functions para leitura/gravação de vendas (RLS aplicada como usuário autenticado).
- Google OAuth via `lovable.auth.signInWithOAuth` + `supabase--configure_social_auth`.
- Seed dos parâmetros de comissão via SQL migration (sem seed em runtime).

Aprovar para eu começar? Sim, o mais importante é transformar essas duas planilhas em um sistema online e depois vamos melhorando o sistema.