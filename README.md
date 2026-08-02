# Lovable Sales Hub (59)

Sistema de Gestão Comercial – Unifique (Loja e PAP)

🎯 Objetivo do Sistema

Transformar as planilhas operacionais de Loja e PAP em um sistema digital integrado, permitindo:

Registro e gestão de vendas

Controle de leads via Kanban

Auditoria e contestação de vendas

Visualização de resultados e projeções

Gestão hierárquica (Consultor → Gerente → Regional)

👤 Estrutura de Usuários e Permissões

Perfis de Acesso

1. Consultor (Loja ou PAP)

Acesso apenas aos seus dados

Pode:

Criar, editar, excluir e transferir vendas e leads

Visualizar dashboard individual

Criar tarefas/agendas

2. Gerente

Acesso aos consultores da sua equipe

Pode:

Visualizar resultados, histórico e produtividade da equipe

Criar/editar/excluir consultores

Criar tarefas para equipe

3. Gerente Regional

Acesso a todos os gerentes e suas equipes

Pode:

Gerenciar gerentes

Visualizar indicadores consolidados

Acompanhar performance regional

🧩 Módulos do Sistema

1. 📊 Registro de Vendas

Estrutura dinâmica baseada no perfil:

Se usuário = Loja → usar modelo Loja

Se usuário = PAP → usar modelo PAP

Campos principais (adaptáveis das planilhas):

Nome do cliente

CPF/CNPJ

Tipo de venda (Fibra, Móvel, Renovação)

Produto/Plano

Data da venda

Status (Instalado, Pendente, Cancelado)

Valor da comissão

Observações

Regras:

Comissão só válida se:

Venda estiver instalada/ativada

Aplicar regras de comissão conforme planilha original

Validações obrigatórias de preenchimento

2. 🎯 Gestão de Leads (Kanban)

Etapas do Funil:

Lead gerado

Contato realizado

Proposta enviada

Negociação

Fechado

Perdido

Funcionalidades:

Drag & drop entre colunas (Kanban)

Registro de:

Nome

Contato

Origem do lead

Responsável

Transferência entre consultores

Histórico de movimentação

3. ⚠️ Contestação de Vendas

Fluxo:

Sistema recebe lista de vendas reconhecidas (input manual colado pelo gestor)

Usuário seleciona o mês de comparação

Sistema cruza:

Vendas registradas pelo consultor

Vendas reconhecidas pelo sistema

Resultado:

Identificação automática de:

Vendas faltantes

Divergências

Vendas não reconhecidas

Ações:

Marcar venda como "Contestar"

Adicionar justificativa

Status da contestação:

Aberta

Em análise

Resolvida

4. 📈 Dashboard Inteligente

Visões disponíveis:

Individual (Consultor)

Total vendido por período:

Mês

Trimestre

Semestre

Ano

Comissão estimada

Taxa de conversão de leads

Projeção de metas

Ranking (Gamificação)

Loja:

Ranking geral por:

Fibra

Móvel

Renovações

PAP:

Ranking por:

Fibra

Móvel

Gerente:

Performance por consultor

Produtividade

Conversão

Regional:

Comparativo entre equipes

Evolução por cidade/região

Performance consolidada

🔄 Fechamento Mensal

Botão: "Fechar Mês"

Regras:

Ativo apenas no último dia do mês

Ao clicar:

Salvar automaticamente dados atuais em histórico

Limpar ambiente de vendas e leads do mês atual

Criar novo ciclo (novo mês)

Histórico:

Nunca deletado

Sempre disponível para consulta

🔐 Regras de Acesso e Segurança

Cada usuário vê apenas seus dados (exceto gestores)

Dados separados por hierarquia:

Consultor → Gerente → Regional

Logs de alteração:

Quem editou

Quando editou

📅 Módulo de Tarefas e Agenda

Funcionalidades:

Criar tarefas:

Para si mesmo

Para outros usuários

Definir:

Data

Hora

Prioridade

Alertas automáticos:

Notificação

Lembrete

⚙️ Regras Técnicas e Lógicas

Estrutura de Banco (sugestão):

Tabelas:

Usuários

Vendas

Leads

Contestações

Tarefas

Histórico Mensal

Lógicas principais:

Comissão:

Se status != "Instalado" → comissão = 0
Senão → aplicar regra da planilha

Permissões:

Se usuário = Consultor:
    acesso = próprios dados

Se usuário = Gerente:
    acesso = equipe

Se usuário = Regional:
    acesso = todos

Fechamento mensal:

Se data = último dia do mês:
    habilitar botão

Ao clicar:
    salvar histórico
    limpar dados atuais

🎨 UX/UI (Sugestão)

Interface simples e mobile-friendly

Dashboard com gráficos:

Barras (ranking)

Linha (evolução)

Kanban visual intuitivo

Cores por status:

Verde = concluído

Amarelo = em andamento

Vermelho = pendente

🧠 Inteligência do Sistema (Diferencial)

Sugestão automática de projeção de meta

Identificação de queda de performance

Alertas de baixa conversão de leads

Insights para gestores

🚀 Resultado Esperado

Eliminar uso de planilhas manuais

Aumentar controle e transparência

Melhorar produtividade dos consultores

Dar visão estratégica para liderança

Criar cultura de performance e acompanhamento

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://team-perf-boost.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8c058fe6-edd1-4935-a792-b07ea1a2cb30).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
