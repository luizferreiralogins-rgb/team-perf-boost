/**
 * Telegram Service — mantém uma sessão TDLib (MTProto) por usuário do CRM.
 *
 * Este processo é o ÚNICO lugar onde ficam api_hash, chaves de sessão e dados
 * sensíveis do Telegram. O CRM só conversa com ele via HTTP autenticado por
 * Bearer, e ele devolve os dados ao CRM via webhook assinado (HMAC-SHA256).
 */
import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import tdl from "tdl";
import { getTdjson } from "prebuilt-tdlib";

const {
  TELEGRAM_API_ID,
  TELEGRAM_API_HASH,
  SERVICE_TOKEN,
  WEBHOOK_URL,
  WEBHOOK_SECRET,
  TDLIB_DATA_DIR = "/data/tdlib",
  PORT = 8080,
} = process.env;

for (const [k, v] of Object.entries({
  TELEGRAM_API_ID,
  TELEGRAM_API_HASH,
  SERVICE_TOKEN,
  WEBHOOK_URL,
  WEBHOOK_SECRET,
})) {
  if (!v) {
    console.error(`[config] variável de ambiente obrigatória ausente: ${k}`);
    process.exit(1);
  }
}

tdl.configure({ tdjson: getTdjson() });
fs.mkdirSync(TDLIB_DATA_DIR, { recursive: true });

/** @type {Map<string, {client: any, state: any}>} */
const sessions = new Map();

function blank(crmUserId) {
  return {
    crmUserId,
    status: "desconectado",
    qrUrl: null,
    expiresAt: null,
    error: null,
    account: null,
  };
}

async function postWebhook(payload) {
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-service-signature": signature,
      },
      body,
    });
    if (!res.ok) console.error(`[webhook] ${res.status}: ${await res.text()}`);
  } catch (err) {
    console.error("[webhook] falha de rede", err);
  }
}

const toIso = (unix) => (unix ? new Date(unix * 1000).toISOString() : new Date().toISOString());

function textOf(message) {
  const c = message?.content;
  if (!c) return { type: "text", content: "" };
  switch (c["@type"]) {
    case "messageText":
      return { type: "text", content: c.text?.text ?? "" };
    case "messagePhoto":
      return { type: "photo", content: c.caption?.text ?? "[foto]" };
    case "messageVideo":
      return { type: "video", content: c.caption?.text ?? "[vídeo]" };
    case "messageVoiceNote":
      return { type: "voice", content: "[áudio]" };
    case "messageDocument":
      return { type: "document", content: c.caption?.text ?? c.document?.file_name ?? "[arquivo]" };
    case "messageSticker":
      return { type: "sticker", content: c.sticker?.emoji ?? "[sticker]" };
    default:
      return { type: "other", content: "[mensagem não suportada]" };
  }
}

function chatTypeOf(chat) {
  const t = chat?.type?.["@type"];
  if (t === "chatTypePrivate") return "private";
  if (t === "chatTypeBasicGroup") return "group";
  if (t === "chatTypeSupergroup") return chat.type.is_channel ? "channel" : "group";
  return "other";
}

function mapMessage(session, message) {
  const { type, content } = textOf(message);
  const me = session.state.account?.telegram_user_id ?? null;
  const sender =
    message.sender_id?.["@type"] === "messageSenderUser" ? message.sender_id.user_id : null;
  return {
    telegram_chat_id: message.chat_id,
    telegram_message_id: message.id,
    sender_telegram_user_id: sender,
    direction: message.is_outgoing || (me && sender === me) ? "out" : "in",
    message_type: type,
    content,
    sent_at: toIso(message.date),
  };
}

async function mapChat(client, chatId) {
  const chat = await client.invoke({ _: "getChat", chat_id: chatId });
  return {
    telegram_chat_id: chat.id,
    chat_type: chatTypeOf(chat),
    title: chat.title ?? "",
    unread_count: chat.unread_count ?? 0,
    last_message_id: chat.last_message?.id ?? null,
    last_message_text: chat.last_message ? textOf(chat.last_message).content : null,
    last_message_at: chat.last_message ? toIso(chat.last_message.date) : null,
  };
}

async function pushAccount(session) {
  await postWebhook({ crmUserId: session.state.crmUserId, account: session.state.account });
}

function sessionFor(crmUserId) {
  let session = sessions.get(crmUserId);
  if (session) return session;

  const dir = path.join(TDLIB_DATA_DIR, crmUserId);
  const client = tdl.createClient({
    apiId: Number(TELEGRAM_API_ID),
    apiHash: TELEGRAM_API_HASH,
    databaseDirectory: path.join(dir, "db"),
    filesDirectory: path.join(dir, "files"),
    skipOldUpdates: true,
  });

  session = { client, state: blank(crmUserId) };
  sessions.set(crmUserId, session);

  client.on("error", (err) => {
    console.error(`[tdlib:${crmUserId}]`, err);
  });

  client.on("update", (update) => {
    handleUpdate(session, update).catch((err) =>
      console.error(`[update:${crmUserId}]`, err),
    );
  });

  return session;
}

async function handleUpdate(session, update) {
  const { client, state } = session;

  switch (update._) {
    case "updateAuthorizationState": {
      const auth = update.authorization_state;
      if (auth._ === "authorizationStateWaitOtherDeviceConfirmation") {
        state.status = "aguardando_qr";
        state.qrUrl = auth.link;
        state.expiresAt = new Date(Date.now() + 30_000).toISOString();
        state.error = null;
      } else if (auth._ === "authorizationStateWaitPassword") {
        state.status = "aguardando_2fa";
        state.qrUrl = null;
      } else if (auth._ === "authorizationStateReady") {
        const me = await client.invoke({ _: "getMe" });
        state.status = "conectado";
        state.qrUrl = null;
        state.expiresAt = null;
        state.error = null;
        state.account = {
          status: "conectado",
          telegram_user_id: me.id,
          username: me.usernames?.editable_username ?? null,
          first_name: me.first_name ?? null,
          last_name: me.last_name ?? null,
          phone: me.phone_number ? `+${me.phone_number}` : null,
          profile_photo_url: null,
          last_sync_at: new Date().toISOString(),
        };
        await pushAccount(session);
      } else if (auth._ === "authorizationStateClosed" || auth._ === "authorizationStateLoggingOut") {
        state.status = "desconectado";
        state.account = { status: "desconectado" };
        await pushAccount(session);
      }
      return;
    }

    case "updateNewMessage": {
      const message = mapMessage(session, update.message);
      const chat = await mapChat(client, update.message.chat_id).catch(() => null);
      await postWebhook({
        crmUserId: state.crmUserId,
        chats: chat ? [chat] : [],
        messages: [message],
      });
      return;
    }

    case "updateChatLastMessage":
    case "updateChatReadInbox": {
      const chat = await mapChat(client, update.chat_id).catch(() => null);
      if (chat) await postWebhook({ crmUserId: state.crmUserId, chats: [chat] });
      return;
    }

    default:
      return;
  }
}

// ---------------------------------------------------------------- HTTP -----

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, sessions: sessions.size }));

app.use((req, res, next) => {
  const header = req.get("authorization") ?? "";
  const expected = `Bearer ${SERVICE_TOKEN}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Não autorizado" });
  }
  const crmUserId = req.body?.crmUserId;
  if (!crmUserId || !/^[0-9a-f-]{36}$/i.test(crmUserId)) {
    return res.status(400).json({ error: "crmUserId inválido" });
  }
  req.crmUserId = crmUserId;
  next();
});

const publicState = (s) => ({
  status: s.status,
  qrUrl: s.qrUrl,
  expiresAt: s.expiresAt,
  error: s.error,
  account: s.account,
});

app.post("/sessions/qr/start", async (req, res) => {
  const session = sessionFor(req.crmUserId);
  try {
    const auth = await session.client.invoke({ _: "getAuthorizationState" });
    if (auth._ === "authorizationStateReady") {
      session.state.status = "conectado";
      return res.json(publicState(session.state));
    }
    await session.client.invoke({
      _: "requestQrCodeAuthentication",
      other_user_ids: [],
    });
    // aguarda o TDLib emitir o link do QR
    for (let i = 0; i < 40 && !session.state.qrUrl; i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    res.json(publicState(session.state));
  } catch (err) {
    console.error("[qr/start]", err);
    res.status(500).json({ error: err?.message ?? "Falha ao iniciar o QR Code" });
  }
});

app.post("/sessions/qr/poll", async (req, res) => {
  const session = sessions.get(req.crmUserId) ?? sessionFor(req.crmUserId);
  res.json(publicState(session.state));
});

app.post("/sessions/qr/2fa", async (req, res) => {
  const session = sessions.get(req.crmUserId);
  if (!session) return res.status(400).json({ error: "Sessão não iniciada" });
  try {
    // A senha é usada apenas nesta chamada e nunca é gravada em disco.
    await session.client.invoke({
      _: "checkAuthenticationPassword",
      password: String(req.body.password ?? ""),
    });
    for (let i = 0; i < 40 && session.state.status !== "conectado"; i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    res.json(publicState(session.state));
  } catch (err) {
    res.status(400).json({ error: err?.message ?? "Senha 2FA inválida" });
  }
});

app.post("/sync", async (req, res) => {
  const session = sessions.get(req.crmUserId);
  if (!session || session.state.status !== "conectado") {
    return res.status(400).json({ error: "Conta do Telegram não conectada" });
  }
  const { client } = session;
  try {
    const chatList = await client.invoke({ _: "getChats", limit: 200 });
    const chats = [];
    for (const id of chatList.chat_ids) {
      const chat = await mapChat(client, id).catch(() => null);
      if (chat) chats.push(chat);
    }

    await client.invoke({ _: "getContacts" }).catch(() => null);
    const contactIds = (await client.invoke({ _: "getContacts" }).catch(() => ({ user_ids: [] })))
      .user_ids ?? [];
    const contacts = [];
    for (const userId of contactIds) {
      const u = await client.invoke({ _: "getUser", user_id: userId }).catch(() => null);
      if (!u) continue;
      contacts.push({
        telegram_user_id: u.id,
        username: u.usernames?.editable_username ?? null,
        first_name: u.first_name ?? null,
        last_name: u.last_name ?? null,
        phone: u.phone_number ? `+${u.phone_number}` : null,
      });
    }

    session.state.account = {
      ...(session.state.account ?? {}),
      status: "conectado",
      last_sync_at: new Date().toISOString(),
    };

    await postWebhook({
      crmUserId: req.crmUserId,
      account: session.state.account,
      chats,
      contacts,
    });
    res.json({ chats: chats.length, contacts: contacts.length });
  } catch (err) {
    console.error("[sync]", err);
    res.status(500).json({ error: err?.message ?? "Falha ao sincronizar" });
  }
});

app.post("/history", async (req, res) => {
  const session = sessions.get(req.crmUserId);
  if (!session || session.state.status !== "conectado") {
    return res.status(400).json({ error: "Conta do Telegram não conectada" });
  }
  const telegramChatId = Number(req.body.telegramChatId);
  if (!telegramChatId) return res.status(400).json({ error: "telegramChatId obrigatório" });
  try {
    const history = await session.client.invoke({
      _: "getChatHistory",
      chat_id: telegramChatId,
      from_message_id: Number(req.body.beforeMessageId ?? 0),
      offset: 0,
      limit: 50,
      only_local: false,
    });
    const messages = (history.messages ?? []).map((m) => mapMessage(session, m));
    if (messages.length) await postWebhook({ crmUserId: req.crmUserId, messages });
    res.json({ fetched: messages.length });
  } catch (err) {
    console.error("[history]", err);
    res.status(500).json({ error: err?.message ?? "Falha ao buscar histórico" });
  }
});

app.post("/messages/send", async (req, res) => {
  const session = sessions.get(req.crmUserId);
  if (!session || session.state.status !== "conectado") {
    return res.status(400).json({ error: "Conta do Telegram não conectada" });
  }
  const telegramChatId = Number(req.body.telegramChatId);
  const text = String(req.body.text ?? "").slice(0, 4096);
  if (!telegramChatId || !text) return res.status(400).json({ error: "Dados inválidos" });
  try {
    const sent = await session.client.invoke({
      _: "sendMessage",
      chat_id: telegramChatId,
      input_message_content: {
        _: "inputMessageText",
        text: { _: "formattedText", text },
      },
    });
    res.json({
      telegram_message_id: sent.id,
      sent_at: toIso(sent.date),
    });
  } catch (err) {
    console.error("[send]", err);
    res.status(500).json({ error: err?.message ?? "Falha ao enviar mensagem" });
  }
});

app.post("/sessions/disconnect", async (req, res) => {
  const session = sessions.get(req.crmUserId);
  try {
    if (session) {
      await session.client.invoke({ _: "logOut" }).catch(() => null);
      await session.client.close().catch(() => null);
      sessions.delete(req.crmUserId);
    }
    fs.rmSync(path.join(TDLIB_DATA_DIR, req.crmUserId), { recursive: true, force: true });
    await postWebhook({
      crmUserId: req.crmUserId,
      account: { status: "desconectado", telegram_user_id: null },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[disconnect]", err);
    res.status(500).json({ error: err?.message ?? "Falha ao desconectar" });
  }
});

app.listen(Number(PORT), () => {
  console.log(`[telegram-service] ouvindo na porta ${PORT}`);
});
