# Integração Telegram Pessoal (MTProto/TDLib) no CRM

## Análise do projeto atual

- Frontend: TanStack Start (React 19) + Tailwind + shadcn, rotas em `src/routes/_authenticated/*`, layout em `src/components/app-shell.tsx`.
- Backend: Lovable Cloud (Supabase) — auth por e-mail/senha, perfis em `profiles`, papéis em `user_roles` (`has_role`), RLS em todas as tabelas.
- Lógica de servidor: `createServerFn` (TanStack) rodando em runtime serverless (Cloudflare Workers).
- Não existe hoje nenhuma estrutura de contatos/chats/mensagens reaproveitável (a antiga tabela `mensagens_chat` é um chat interno desativado). A integração terá tabelas próprias.

## Limitação técnica que define a arquitetura

TDLib/MTProto exige processo persistente, sockets TCP e disco — o runtime serverless deste projeto **não** consegue hospedar isso. Portanto, seguindo o item 16 do pedido, **não haverá simulação**: entrego CRM + banco + contratos, e o Telegram Service fica como componente externo a hospedar (Node + `tdl`/`tdlib` ou `gramjs`, em VPS/Fly.io/Railway/Docker).

```text
CRM (Lovable) → Server Functions → Telegram Service (host externo, TDLib) → conta pessoal do usuário
                      ↓                        ↓
                  Supabase  ←  webhook /api/public/telegram-service/events  ←  updates
                      ↓
                 Realtime → UI
```

## Fase 1 — Banco de dados + RLS

Tabelas novas (todas com `GRANT` + RLS escopada a `auth.uid()`):

- `telegram_accounts` — 1 por usuário do CRM (`crm_user_id` único), com `status` (`desconectado`, `aguardando_qr`, `qr_lido`, `aguardando_2fa`, `conectado`, `erro`), dados do perfil Telegram, `session_reference` (apenas identificador opaco; nenhuma chave de sessão fica no banco acessível ao cliente) e `last_sync_at`.
- `telegram_contacts`, `telegram_chats`, `telegram_messages` conforme especificado, com índices e unicidade `(telegram_chat_id, telegram_message_id)` para deduplicação.
- `access_hash` fica em coluna protegida (leitura só pelo serviço via service role).
- Realtime habilitado em `telegram_chats` e `telegram_messages`.

## Fase 2 — Contratos do Telegram Service

- Server functions em `src/lib/telegram.functions.ts` (autenticadas): `startQrLogin`, `pollQrLogin`, `submit2faPassword`, `syncTelegram`, `sendTelegramMessage`, `loadOlderMessages`, `disconnectTelegram`. Todas chamam o serviço externo via HTTP com `TELEGRAM_SERVICE_URL` + `TELEGRAM_SERVICE_TOKEN` (segredos apenas no servidor).
- Rota pública `src/routes/api/public/telegram-service/events.ts` recebe updates do serviço, valida assinatura HMAC (`TELEGRAM_SERVICE_WEBHOOK_SECRET`) e grava no banco com service role → Realtime atualiza a UI.
- Documento `docs/telegram-service.md` com o contrato REST completo, o esqueleto do serviço TDLib e as variáveis (`TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `SUPABASE_SERVICE_ROLE_KEY`, etc.).
- Enquanto `TELEGRAM_SERVICE_URL` não estiver configurada, a UI mostra aviso explícito de "serviço não configurado" — nunca um estado falso de conectado.

## Fases 3 a 8 — Interface

- `Perfil → Integrações → Telegram`: cartão de status (🔴/🟢), botão **Conectar Telegram** abrindo diálogo com QR Code (`tg://login?token=...`, renovação automática na expiração), estados de leitura/2FA/erro, além de **Abrir Telegram**, **Sincronizar** (com "Última sincronização") e **Desconectar** com confirmação.
- Nova rota `/telegram` (item na sidebar): inbox em 3 colunas — lista de conversas com busca (nome, @username, telefone, conteúdo), thread com histórico paginado (scroll para cima) e painel de informações do contato.
- Envio de texto com estados `enviando/enviada/falhou`; `message_type` e `media_url` já modelados para mídia futura.
- Recebimento em tempo real por Supabase Realtime, atualizando última mensagem, horário e não lidas.

## O que você precisará fornecer

- Uma máquina/host para o Telegram Service (Docker, VPS, Fly.io ou similar) — entrego o código e o passo a passo.
- `TELEGRAM_API_ID` e `TELEGRAM_API_HASH` obtidos em my.telegram.org (guardados como segredos do backend).
