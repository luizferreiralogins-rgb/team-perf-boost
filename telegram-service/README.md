# Telegram Service (TDLib / MTProto)

Serviço externo que mantém **uma sessão pessoal de Telegram por usuário do CRM**.
Ele é o único componente que conhece `api_hash` e as chaves de sessão. O CRM fala com
ele por HTTP autenticado (Bearer) e recebe os dados de volta por webhook assinado (HMAC).

## 1. Obter as credenciais do Telegram

1. Acesse https://my.telegram.org e faça login com o seu número.
2. Abra **API development tools** e crie um app (qualquer nome, ex.: `CRM Unifique`).
3. Guarde `api_id` e `api_hash`.

## 2. Criar os dois segredos compartilhados

No terminal (ou em um gerenciador de senhas), gere dois valores aleatórios:

```bash
openssl rand -hex 32   # vira SERVICE_TOKEN / TELEGRAM_SERVICE_TOKEN
openssl rand -hex 32   # vira WEBHOOK_SECRET / TELEGRAM_SERVICE_WEBHOOK_SECRET
```

O **mesmo** valor precisa ficar no serviço e no CRM.

## 3. Publicar o serviço

### Fly.io (recomendado — tem disco persistente barato)

```bash
fly launch --no-deploy --copy-config --name crm-telegram-service
fly volumes create tdlib_data --size 3 --region gru
fly secrets set \
  TELEGRAM_API_ID=... \
  TELEGRAM_API_HASH=... \
  SERVICE_TOKEN=... \
  WEBHOOK_SECRET=... \
  WEBHOOK_URL=https://project--8c058fe6-edd1-4935-a792-b07ea1a2cb30-dev.lovable.app/api/public/telegram-service/events
fly deploy
```

### Docker em VPS

```bash
docker build -t crm-telegram-service .
docker run -d --name telegram-service --restart unless-stopped \
  -p 8080:8080 -v /srv/tdlib:/data --env-file .env crm-telegram-service
```

Coloque um HTTPS na frente (Caddy/Nginx). O CRM exige `https://`.

Teste: `curl https://SEU-SERVICO/health` → `{"ok":true,...}`.

## 4. Cadastrar os segredos no CRM

No CRM (backend), cadastre:

| Segredo | Valor |
| --- | --- |
| `TELEGRAM_SERVICE_URL` | `https://SEU-SERVICO` (sem barra no final) |
| `TELEGRAM_SERVICE_TOKEN` | mesmo `SERVICE_TOKEN` |
| `TELEGRAM_SERVICE_WEBHOOK_SECRET` | mesmo `WEBHOOK_SECRET` |

## 5. Usar

`Perfil → Telegram → Conectar` mostra o QR Code. No celular:
**Telegram → Configurações → Dispositivos → Conectar dispositivo** e escaneie.
Se a conta tiver verificação em duas etapas, o CRM pede a senha (usada só na hora,
nunca gravada). Depois use `Sincronizar` e a caixa de entrada em `/telegram`.

## Notas importantes

- **Uma sessão por usuário**: o diretório TDLib é `TDLIB_DATA_DIR/<crmUserId>`; nunca
  compartilhe entre usuários.
- O volume precisa ser persistente, senão todo restart força novo QR Code.
- Contas pessoais estão sujeitas aos limites e regras do Telegram (flood wait, spam);
  evite disparos em massa.
- Ao desconectar, o serviço executa `logOut` e apaga o diretório da sessão.
