# Reestruturação de Acessos e Hierarquia

## Visão geral

Hoje qualquer novo cadastro entra como **Consultor**. Vamos inverter a lógica: o **Gerente Regional** é o perfil principal, e a criação de acessos passa a ser feita de cima para baixo:

```text
Regional  ──cria──►  Gerentes         (vê tudo, filtra por qualquer nível)
   │
Gerente   ──cria──►  Consultores       (vê só o próprio time)
   │
Consultor ──registra──►  Vendas
```

Um consultor é sempre vinculado a um **Gerente** e, opcionalmente, marcado como **Loja (Norte / Sul / Shopping)** ou **PAP**.

## Mudanças de banco

Nova migração:

1. Enum `loja_unidade` = `norte | sul | shopping`.
2. Coluna `profiles.loja_unidade loja_unidade NULL` (só faz sentido quando `canal = 'loja'`).
3. Ajustar `handle_new_user()`: primeiro cadastro do sistema vira **Regional** automaticamente; demais permanecem como Consultor "solto" até que um gestor os promova/vincule.
4. Políticas RLS de `user_roles`:
   - Regional pode `INSERT/UPDATE/DELETE` roles `gerente` e `consultor`.
   - Gerente pode `INSERT/UPDATE/DELETE` role `consultor` **apenas** para perfis onde `profiles.gerente_id = auth.uid()`.
5. Políticas de `profiles`:
   - Regional pode atualizar qualquer perfil (canal, loja_unidade, gerente_id, regional_id, ativo).
   - Gerente pode atualizar consultores do seu time (canal, loja_unidade, ativo) — **não** pode reatribuir para outro gerente.
6. Função `admin_create_user(email, nome, role, canal, loja_unidade, gerente_id)` `SECURITY DEFINER` que:
   - valida se o chamador tem permissão para criar aquele `role`,
   - usa `supabaseAdmin` via server function (ver abaixo) — a parte SQL só valida/insere em `profiles` e `user_roles` depois que o usuário existe em `auth.users`.

## Server functions (createServerFn + requireSupabaseAuth)

Arquivo `src/lib/team.functions.ts`:

- `createTeamMember({ email, nome, role, canal, loja_unidade, gerente_id })`
  - checa role do chamador (`has_role`),
  - `supabaseAdmin.auth.admin.createUser` com senha temporária + envio de convite,
  - insere/atualiza `profiles` e `user_roles`.
- `updateTeamMember({ user_id, ...campos })` — mesma checagem de escopo.
- `deleteTeamMember({ user_id })` — `supabaseAdmin.auth.admin.deleteUser` (cascata remove profile/roles).
- `listTeam()` — retorna perfis visíveis ao chamador, já com role e nome do gerente.

Admin client é importado dinamicamente dentro do handler.

## Telas

### `/equipe` (reformulada)
- Regional: tabela com **Gerentes** e **Consultores**, filtro por gerente, canal, unidade, status.
- Gerente: tabela apenas dos **Consultores do seu time**, filtro por canal/unidade/status.
- Ações por linha: **Editar**, **Desativar**, **Excluir**.
- Botão **"Novo acesso"** abre dialog:
  - Regional escolhe entre Gerente ou Consultor (e nesse caso qual gerente).
  - Gerente cria apenas Consultor, escolhendo Canal (Loja/PAP) e, se Loja, Unidade (Norte/Sul/Shopping).

### `/dashboard` com filtros
Barra de filtros no topo (visível para Gerente e Regional):
- Período (mês/intervalo de datas),
- Canal (Loja/PAP/Todos),
- Unidade da loja (Norte/Sul/Shopping/Todas) — só quando Canal=Loja,
- Gerente (só para Regional),
- Consultor (dependente dos filtros acima),
- Indicadores (checkboxes): Vendas, Instaladas, Receita, Comissão, Ticket médio, Ranking.

Consultor continua vendo apenas o próprio dashboard, sem filtros de escopo.

### `/vendas`
- Adicionar mesmos filtros de escopo (quem, quando) para Gerente/Regional.

### Cadastro público (`/auth`)
- Remover o seletor de canal do signup — canal e vínculo agora vêm do gestor.
- Mensagem: "Seu acesso será configurado pelo seu gestor" para signups que não sejam o primeiro Regional.

## Aspectos técnicos

- Novo `useMe()` retorna também `loja_unidade` e helpers `isRegional`, `isGerente`.
- Filtros do dashboard viram `search params` da rota (`validateSearch` com Zod + `fallback`), assim links são compartilháveis.
- Queries do dashboard passam a receber `vendedor_ids[]` calculados a partir dos filtros; RLS continua sendo a última linha de defesa.
- Convites por e-mail usam o fluxo padrão do Supabase Auth (link mágico) — sem senha temporária exposta na UI.

## Fora deste escopo

- Reset de senha administrativo com senha visível.
- Reatribuição em massa de consultores entre gerentes (fica para depois).
- Logs de auditoria de criação/exclusão de acessos.
