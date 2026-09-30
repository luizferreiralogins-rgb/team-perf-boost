# WhatsApp Business oficial dentro do CRM

Integração via conector oficial do WhatsApp Business (Meta), permitindo que os usuários conversem com os clientes diretamente dentro do sistema, com histórico salvo e vínculo ao Pós-vendas.

## Etapa 1 — Conexão (feita por você)

- Abro o cartão de conexão do WhatsApp Business aqui no chat; você conclui o fluxo da Meta (conta Business, número, verificação de e-mail/telefone).
- Em **Connectors → WhatsApp → Incoming messages**, este projeto precisa estar selecionado como destino dos callbacks (isso redireciona os eventos de outro projeto, se houver).

## Etapa 2 — Banco de dados

- `whatsapp_conversations` — uma por contato: número E.164, nome, última mensagem, horário, não lidas, `vendedor_id` (dono da conversa).
- `whatsapp_messages` — `conversation_id`, `provider_message_id` (deduplicação), direção (enviada/recebida), tipo (texto/mídia), conteúdo, `media_id`, status (`accepted/sent/delivered/read/failed`), timestamps do provedor.
- `whatsapp_webhook_events` — caixa de entrada durável dos callbacks (`delivery_id` único, evento, payload, `processed_at`, `processing_error`).
- RLS: consultor vê só as próprias conversas; gestores veem as da equipe via `is_gestor_de`; GRANTs para `authenticated`/`service_role`. Realtime em conversas e mensagens.

## Etapa 3 — Servidor

- `src/routes/api/public/whatsapp/webhook.ts` — recebe eventos (`whatsapp.message`, `whatsapp.status`, `whatsapp.message_error`, `whatsapp.template_status`), verifica assinatura com `@lovable.dev/webhooks-js`, grava na caixa de entrada e processa de forma idempotente (mensagens novas, atualizações de status reconciliadas por `provider_message_id`, sem regredir `delivered`/`read`).
- `src/lib/whatsapp.functions.ts` (autenticadas): `sendWhatsappMessage` (texto livre dentro da janela de 24h; fora dela exige modelo aprovado), `listConversations`, `listMessages`, `markRead`. Envio via gateway (`/messages`), gravando o `messages[0].id` retornado para reconciliação de status.

## Etapa 4 — Interface

- Novo item lateral **WhatsApp** (ícone `MessageCircle`): caixa de entrada em 2 colunas — lista de conversas com busca e não lidas; thread com histórico, envio de texto e estados de envio (enviando/enviada/entregue/lida/falhou).
- Realtime atualiza conversas e mensagens sem recarregar.
- No **Pós-vendas**, o número do cliente ganha opção de abrir a conversa dentro do sistema (além do wa.me atual).

## Etapa 5 — Validação

- Após a conexão, testamos enviando uma mensagem para o seu próprio número e respondendo pelo celular, conferindo recebimento em tempo real e status de entrega.
- Modelos de mensagem (para contatos fora da janela de 24h, ex.: lembretes de pós-venda) ficam para uma etapa seguinte, pois a Meta leva até 48h para aprová-los.

## Limitações conhecidas

- Mensagens iniciadas pela empresa fora da janela de 24h após a última mensagem do cliente exigem modelo aprovado (e marketing é pago).
- Durante a revisão inicial da Meta, o volume de mensagens iniciadas pela empresa é limitado.
- Mídia (imagens, documentos, áudio) fica como melhoria futura; a modelagem já prevê `media_id`.
