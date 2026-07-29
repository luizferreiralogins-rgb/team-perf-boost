# Especificação — Serviço Ponte MTProto (Telegram pessoal)

Este documento descreve o serviço **externo** que o sistema Unifique consome para permitir
que cada usuário faça login com o **próprio número de Telegram** e converse com qualquer
contato (pessoas internas, externas ou bots).

> O serviço **não roda na Lovable**. Ele precisa ser hospedado em um servidor Node
> dedicado (VPS, Railway, Fly.io, Render...), porque o protocolo MTProto exige conexões
> TCP persistentes, processos longos e bibliotecas nativas — nada disso existe em runtime
> serverless/edge.

---

## 1. Arquitetura

```text
Navegador  ──►  App Unifique (server functions)  ──►  Ponte MTProto (Node + GramJS)  ──►  Telegram DC
                (autentica o usuário via Supabase)     (1 cliente por usuário logado)
```

- O navegador **nunca** fala com a ponte diretamente.
- O app envia sempre o `app_user_id` (UUID do Supabase) já autenticado.
- A **string de sessão do Telegram nunca sai da ponte** e nunca é gravada no banco do app.

## 2. Variáveis de ambiente no app

| Variável | Descrição |
|---|---|
| `TELEGRAM_BRIDGE_URL` | URL base HTTPS do serviço, ex.: `https://tg-bridge.suaempresa.com.br` |
| `TELEGRAM_BRIDGE_SECRET` | Segredo compartilhado enviado no header `X-Bridge-Secret` |

Enquanto essas variáveis não existirem, a tela `/telegram-pessoal` mostra o estado
"serviço não configurado" e nenhuma chamada é feita.

## 3. Autenticação entre app e ponte

Toda requisição:

```http
POST /session/status
Content-Type: application/json
X-Bridge-Secret: <TELEGRAM_BRIDGE_SECRET>

{ "app_user_id": "8c058fe6-...-b07ea1a2cb30" }
```

A ponte deve:
- comparar o segredo em tempo constante (`timingSafeEqual`);
- rejeitar com `401` quando não bater;
- tratar `app_user_id` como a chave única da sessão MTProto.

## 4. Endpoints

Todos os endpoints são `POST`, JSON de entrada e saída. Erros retornam
`{ "error": "mensagem legível" }` com status 4xx/5xx.

### 4.1 `POST /session/status`
Entrada: `{ app_user_id }`

Saída:
```json
{
  "connected": true,
  "phone": "+5584991234567",
  "firstName": "Ivandel",
  "username": "ivandel",
  "connectedAt": "2026-07-29T19:00:00Z"
}
```
Quando não logado: `{ "connected": false }`.

### 4.2 `POST /auth/send-code`
Inicia o login. Entrada: `{ app_user_id, phone }` (E.164).

Saída: `{ "phoneCodeHash": "abc...", "timeout": 60 }`

Chama `client.sendCode({ apiId, apiHash }, phone)`.

### 4.3 `POST /auth/sign-in`
Entrada: `{ app_user_id, phone, phoneCodeHash, code }`

Saída:
- sucesso: `{ "status": "ok", "firstName": "...", "username": "..." }`
- 2FA ativa: `{ "status": "password_required", "hint": "dica da senha" }`
- código errado: `400` com `{ "error": "Código inválido" }`

### 4.4 `POST /auth/password`
Entrada: `{ app_user_id, password }` — usado só após `password_required`.

Saída: igual ao 4.3 em caso de sucesso.

A senha de 2FA **não pode ser persistida** em lugar nenhum; use-a apenas na chamada
`client.signInWithPassword` e descarte da memória.

### 4.5 `POST /auth/logout`
Entrada: `{ app_user_id }`. Executa `client.invoke(new Api.auth.LogOut())`,
apaga a sessão criptografada e encerra o worker. Saída: `{ "ok": true }`.

### 4.6 `POST /dialogs`
Lista as conversas (contatos, grupos, bots). Entrada: `{ app_user_id, limit? }` (padrão 50).

Saída:
```json
{
  "dialogs": [
    { "id": "77712345", "title": "Karine Souza", "username": "karine",
      "type": "user", "unread": 2, "lastMessage": "Bom dia!",
      "lastDate": "2026-07-29T18:55:00Z" }
  ]
}
```
`type`: `user` | `group` | `channel` | `bot`.

### 4.7 `POST /messages`
Entrada: `{ app_user_id, peer_id, limit? }` (padrão 50, mais recentes primeiro).

Saída:
```json
{
  "messages": [
    { "id": "9911", "out": false, "text": "Bom dia!", "author": "Karine Souza",
      "date": "2026-07-29T18:55:00Z" }
  ]
}
```

### 4.8 `POST /messages/send`
Entrada: `{ app_user_id, peer_id, text }` (`text` ≤ 4096).

Saída: `{ "id": "9912", "date": "2026-07-29T19:01:00Z" }`

### 4.9 `POST /search`
Busca contatos/usuários para iniciar conversa nova.
Entrada: `{ app_user_id, query }` → `{ "results": [ { id, title, username, type } ] }`

### 4.10 `GET /health`
Sem autenticação: `{ "ok": true, "sessions": 12 }`.

## 5. Requisitos de implementação da ponte

1. **GramJS** (`telegram` no npm) ou Telethon (Python). `api_id`/`api_hash` obtidos em
   <https://my.telegram.org> — um par por aplicação, guardado só no servidor.
2. **Um cliente por usuário**, mantido vivo em memória com reconexão automática, e
   encerrado por inatividade (ex.: 30 min) — reconectando sob demanda a partir da sessão.
3. **Sessões criptografadas em repouso**: AES-256-GCM com chave em KMS/Vault (nunca no
   código, nunca no banco do app). Rotina de rotação da chave.
4. **Rate limit por usuário** e tratamento de `FLOOD_WAIT_X` do Telegram (aguardar o
   número de segundos informado antes de repetir).
5. **Logs sem conteúdo de mensagem** e sem números completos — apenas IDs internos.
6. **Retenção**: não armazenar histórico de mensagens na ponte; ela é apenas proxy.

## 6. Riscos que o cliente precisa aceitar formalmente

- A sessão MTProto equivale à conta pessoal completa: quem tiver acesso ao servidor lê e
  envia mensagens privadas em nome do colaborador.
- Coleta de senha de 2FA de terceiros exige consentimento explícito e registro (LGPD).
- O Telegram pode **banir números** usados por clientes automatizados em contexto
  corporativo — é uso fora dos Termos de Serviço para bots/automação.
- Conversas pessoais dos consultores passam por infraestrutura da empresa.

Recomenda-se termo de consentimento assinado por usuário antes de habilitar o recurso.

## 7. Roteiro sugerido de implantação

1. Criar `api_id`/`api_hash` em my.telegram.org.
2. Subir a ponte em VPS com HTTPS e IP fixo.
3. Cadastrar `TELEGRAM_BRIDGE_URL` e `TELEGRAM_BRIDGE_SECRET` nos segredos deste app.
4. Testar com **um** número de homologação antes de liberar à equipe.
5. Coletar os termos de consentimento e só então liberar o menu para todos.
