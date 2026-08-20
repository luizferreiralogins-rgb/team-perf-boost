# Telegram Service (TDLib / MTProto)

Este CRM roda em runtime serverless (Cloudflare Workers), que **não** consegue manter sessões
TDLib/MTProto (processo persistente, sockets TCP e disco). Por isso a integração com a conta
pessoal do Telegram é dividida em duas partes:

```
CRM (Lovable)  ->  server functions  ->  Telegram Service (host externo, TDLib)  ->  conta pessoal
      ^                                            |
      |                                            v
  Supabase Realtime  <-  webhook /api/public/telegram-service/events
```

O que já está pronto no CRM:

- Tabelas `telegram_accounts`, `telegram_contacts`, `telegram_chats`, `telegram_messages` com RLS
  por usuário e Realtime habilitado.
- Server functions autenticadas em `src/lib/telegram.functions.ts`.
- Webhook assinado em `src/routes/api/public/telegram-service/events.ts`.
- Interface: `Perfil → Integrações → Telegram` e a caixa de entrada em `/telegram`.

Falta apenas hospedar o serviço abaixo.

## Variáveis de ambiente

No CRM (segredos do backend):

| Variável | Uso |
| --- | --- |
| `TELEGRAM_SERVICE_URL` | URL base https do serviço |
| `TELEGRAM_SERVICE_TOKEN` | Bearer usado pelo CRM ao chamar o serviço |
| `TELEGRAM_SERVICE_WEBHOOK_SECRET` | Segredo HMAC do webhook |

No Telegram Service:

| Variável | Uso |
| --- | --- |
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | credenciais de my.telegram.org |
| `SERVICE_TOKEN` | mesmo valor de `TELEGRAM_SERVICE_TOKEN` |
| `WEBHOOK_URL` | `https://project--<id>-dev.lovable.app/api/public/telegram-service/events` |
| `WEBHOOK_SECRET` | mesmo valor de `TELEGRAM_SERVICE_WEBHOOK_SECRET` |
| `TDLIB_DATA_DIR` | volume persistente, um subdiretório por `crmUserId` |

`TELEGRAM_API_HASH` e as chaves de sessão **nunca** saem do serviço.

## Contrato REST (todas POST, `Authorization: Bearer <SERVICE_TOKEN>`)

### `POST /sessions/qr/start`
```jsonc
// req
{ "crmUserId": "uuid" }
// res
{ "status": "aguardando_qr", "qrUrl": "tg://login?token=BASE64URL", "expiresAt": "ISO-8601" }
```
Cria (ou reutiliza) a sessão TDLib isolada do usuário e devolve o token de
`authorizationStateWaitOtherDeviceConfirmation`.

### `POST /sessions/qr/poll`
```jsonc
{ "crmUserId": "uuid" }
// res: status ∈ desconectado | aguardando_qr | qr_lido | aguardando_2fa | conectado | erro
{ "status": "conectado", "qrUrl": null, "expiresAt": null,
  "account": { "telegram_user_id": 123, "username": "joao", "first_name": "João", "last_name": null } }
```
Quando o token expira, o serviço gera um novo e devolve `status: "aguardando_qr"` com o novo `qrUrl`.

### `POST /sessions/qr/2fa`
```jsonc
{ "crmUserId": "uuid", "password": "..." }  // a senha nunca é persistida
{ "status": "conectado" }
```

### `POST /sync`
```jsonc
{ "crmUserId": "uuid" }
{ "chats": 42, "contacts": 130 }
```
Sincroniza contatos e chats e envia tudo pelo webhook.

### `POST /history`
```jsonc
{ "crmUserId": "uuid", "chatId": "uuid-do-chat-no-crm", "beforeMessageId": 12345 }
{ "fetched": 50 }
```

### `POST /messages/send`
```jsonc
{ "crmUserId": "uuid", "chatId": "uuid", "telegramChatId": 123456789, "text": "olá" }
{ "telegram_message_id": 987, "sent_at": "ISO-8601" }
```

### `POST /sessions/disconnect`
```jsonc
{ "crmUserId": "uuid" }
{ "ok": true }
```
Executa `logOut` no TDLib, apaga o diretório de sessão e revoga a autorização.

## Webhook do serviço para o CRM

`POST {WEBHOOK_URL}` com header `x-telegram-service-signature: <hex hmac-sha256 do corpo cru>`:

```jsonc
{
  "crmUserId": "uuid",
  "account":  { "status": "conectado", "telegram_user_id": 1, "username": "joao",
                "first_name": "João", "profile_photo_url": null, "last_sync_at": "ISO" },
  "contacts": [ { "telegram_user_id": 1, "access_hash": "...", "username": "maria", "phone": "+55..." } ],
  "chats":    [ { "telegram_chat_id": 1, "chat_type": "private", "title": "Maria",
                  "unread_count": 2, "last_message_id": 9, "last_message_text": "oi",
                  "last_message_at": "ISO" } ],
  "messages": [ { "telegram_chat_id": 1, "telegram_message_id": 9, "sender_telegram_user_id": 1,
                  "direction": "in", "message_type": "text", "content": "oi", "sent_at": "ISO" } ]
}
```

Deduplicação por `(telegram_chat_id, telegram_message_id)`. Enviar o webhook a cada
`updateNewMessage`, `updateChatLastMessage`, `updateChatReadInbox` e ao final de cada sync.

## Esqueleto do serviço (Node + `tdl`)

```ts
import tdl from "tdl";
import { getTdjson } from "prebuilt-tdlib";
tdl.configure({ tdjson: getTdjson() });

const clients = new Map<string, tdl.Client>(); // uma sessão por crmUserId — nunca compartilhar

function clientFor(crmUserId: string) {
  let c = clients.get(crmUserId);
  if (!c) {
    c = tdl.createClient({
      apiId: Number(process.env.TELEGRAM_API_ID),
      apiHash: process.env.TELEGRAM_API_HASH!,
      databaseDirectory: `${process.env.TDLIB_DATA_DIR}/${crmUserId}/db`,
      filesDirectory: `${process.env.TDLIB_DATA_DIR}/${crmUserId}/files`,
      skipOldUpdates: true,
    });
    c.on("update", (u) => handleUpdate(crmUserId, u)); // -> postWebhook(...)
    clients.set(crmUserId, c);
  }
  return c;
}
```

QR: chamar `requestQrCodeAuthentication` e ler `authorizationStateWaitOtherDeviceConfirmation.link`.
2FA: `authorizationStateWaitPassword` → `checkAuthenticationPassword`.

Hospedagem sugerida: Docker em VPS, Fly.io ou Railway, com volume persistente para `TDLIB_DATA_DIR`.
