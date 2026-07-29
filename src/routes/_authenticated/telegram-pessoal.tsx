import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, LogOut, RefreshCw, Search, Send, ShieldAlert } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  buscarContatos,
  confirmarCodigoPessoal,
  confirmarSenha2FA,
  enviarCodigoPessoal,
  enviarMensagemPessoal,
  getStatusPessoal,
  listarDialogos,
  listarMensagensPessoal,
  sairTelegramPessoal,
  type Dialogo,
} from "@/lib/telegram-pessoal.functions";

export const Route = createFileRoute("/_authenticated/telegram-pessoal")({
  head: () => ({
    meta: [
      { title: "Telegram pessoal — Unifique Comercial" },
      {
        name: "description",
        content:
          "Conecte seu número pessoal do Telegram e converse com contatos internos, externos e bots dentro do sistema Unifique.",
      },
      { property: "og:title", content: "Telegram pessoal — Unifique Comercial" },
      {
        property: "og:description",
        content: "Login pelo número pessoal do Telegram para falar com qualquer contato no sistema.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TelegramPessoalPage,
});

function TelegramPessoalPage() {
  const statusFn = useServerFn(getStatusPessoal);
  const status = useQuery({ queryKey: ["tg-pessoal-status"], queryFn: () => statusFn() });

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Telegram pessoal</h1>
          <p className="text-sm text-muted-foreground">
            Conecte seu próprio número e converse com qualquer contato — pessoas internas, externas
            ou bots já ativos na sua conta.
          </p>
        </header>

        <AvisoSeguranca />

        {status.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {status.data && !status.data.configurado && <ServicoNaoConfigurado />}
        {status.data?.configurado && !status.data.connected && <LoginTelegram />}
        {status.data?.configurado && status.data.connected && (
          <Conversas nome={status.data.firstName ?? null} username={status.data.username ?? null} />
        )}
      </div>
    </AppShell>
  );
}

function AvisoSeguranca() {
  return (
    <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      <div className="space-y-1">
        <p className="font-medium">Leia antes de conectar</p>
        <p className="text-muted-foreground">
          Conectar o número pessoal cria uma sessão que dá acesso completo à sua conta do Telegram
          através da infraestrutura da empresa. O Telegram pode restringir números usados por
          clientes automatizados. Só conecte após o termo de consentimento interno.
        </p>
      </div>
    </div>
  );
}

function ServicoNaoConfigurado() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-5 w-5" /> Serviço ainda não configurado
        </CardTitle>
        <CardDescription>
          O login com número pessoal depende de um serviço externo (ponte MTProto) hospedado fora
          desta plataforma, porque o protocolo exige conexão permanente com os servidores do
          Telegram.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>Para ativar, é preciso:</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Subir o serviço descrito em <code>docs/telegram-mtproto-bridge.md</code> (Node + GramJS)
            em um servidor próprio com HTTPS.
          </li>
          <li>
            Cadastrar os segredos <code>TELEGRAM_BRIDGE_URL</code> e{" "}
            <code>TELEGRAM_BRIDGE_SECRET</code> neste app.
          </li>
          <li>Recarregar esta página — o login por número aparece automaticamente.</li>
        </ol>
        <p>
          Enquanto isso, a caixa de entrada do bot continua funcionando normalmente em{" "}
          <b>Chat Telegram</b>.
        </p>
      </CardContent>
    </Card>
  );
}

function LoginTelegram() {
  const qc = useQueryClient();
  const enviarCodigo = useServerFn(enviarCodigoPessoal);
  const confirmarCodigo = useServerFn(confirmarCodigoPessoal);
  const confirmarSenha = useServerFn(confirmarSenha2FA);

  const [etapa, setEtapa] = useState<"phone" | "code" | "password">("phone");
  const [phone, setPhone] = useState("+55");
  const [hash, setHash] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  const mCodigo = useMutation({
    mutationFn: () => enviarCodigo({ data: { phone } }),
    onSuccess: (r) => {
      setHash(r.phoneCodeHash);
      setEtapa("code");
      toast.success("Código enviado pelo Telegram.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mConfirmar = useMutation({
    mutationFn: () => confirmarCodigo({ data: { phone, phoneCodeHash: hash, code } }),
    onSuccess: (r) => {
      if (r.status === "password_required") {
        setHint(r.hint ?? null);
        setEtapa("password");
        return;
      }
      qc.invalidateQueries({ queryKey: ["tg-pessoal-status"] });
      toast.success("Telegram conectado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mSenha = useMutation({
    mutationFn: () => confirmarSenha({ data: { password } }),
    onSuccess: () => {
      setPassword("");
      qc.invalidateQueries({ queryKey: ["tg-pessoal-status"] });
      toast.success("Telegram conectado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="text-base">Entrar com meu número</CardTitle>
        <CardDescription>
          {etapa === "phone" && "Informe o número no formato internacional."}
          {etapa === "code" && "Digite o código que o Telegram enviou ao seu aplicativo."}
          {etapa === "password" && "Sua conta tem verificação em duas etapas."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {etapa === "phone" && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              mCodigo.mutate();
            }}
          >
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+5584991234567"
              inputMode="tel"
              maxLength={20}
            />
            <Button type="submit" disabled={mCodigo.isPending} className="w-full">
              Enviar código
            </Button>
          </form>
        )}

        {etapa === "code" && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              mConfirmar.mutate();
            }}
          >
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="12345"
              inputMode="numeric"
              maxLength={7}
            />
            <Button type="submit" disabled={mConfirmar.isPending} className="w-full">
              Confirmar código
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setEtapa("phone")}>
              Usar outro número
            </Button>
          </form>
        )}

        {etapa === "password" && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              mSenha.mutate();
            }}
          >
            {hint && <p className="text-xs text-muted-foreground">Dica: {hint}</p>}
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha da verificação em duas etapas"
              autoComplete="one-time-code"
            />
            <Button type="submit" disabled={mSenha.isPending} className="w-full">
              Entrar
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function Conversas({ nome, username }: { nome: string | null; username: string | null }) {
  const qc = useQueryClient();
  const dialogosFn = useServerFn(listarDialogos);
  const sairFn = useServerFn(sairTelegramPessoal);
  const buscarFn = useServerFn(buscarContatos);
  const [peer, setPeer] = useState<Dialogo | null>(null);
  const [busca, setBusca] = useState("");

  const dialogos = useQuery({
    queryKey: ["tg-pessoal-dialogos"],
    queryFn: () => dialogosFn(),
    refetchInterval: 15_000,
  });

  const resultados = useQuery({
    queryKey: ["tg-pessoal-busca", busca],
    queryFn: () => buscarFn({ data: { query: busca } }),
    enabled: busca.trim().length >= 2,
  });

  const sair = useMutation({
    mutationFn: () => sairFn(),
    onSuccess: () => {
      setPeer(null);
      qc.invalidateQueries({ queryKey: ["tg-pessoal-status"] });
      toast.success("Sessão encerrada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lista: Dialogo[] =
    busca.trim().length >= 2
      ? (resultados.data ?? []).map((r) => ({
          ...r,
          unread: 0,
          lastMessage: null,
          lastDate: null,
        }))
      : (dialogos.data ?? []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="font-medium">{nome ?? "Conectado"}</span>{" "}
          <span className="text-muted-foreground">{username ? `@${username}` : ""}</span>
        </div>
        <Button variant="ghost" size="sm" disabled={sair.isPending} onClick={() => sair.mutate()}>
          <LogOut className="mr-2 h-4 w-4" /> Encerrar sessão
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="flex h-[70vh] flex-col">
          <CardHeader className="space-y-2 border-b pb-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar contato ou @usuário"
                maxLength={64}
              />
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0">
            {lista.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">Nenhuma conversa encontrada.</p>
            )}
            {lista.map((d) => (
              <button
                key={d.id}
                onClick={() => setPeer(d)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 border-b px-4 py-3 text-left hover:bg-accent",
                  peer?.id === d.id && "bg-accent",
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{d.title}</span>
                  {d.unread > 0 && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">
                      {d.unread}
                    </span>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {d.lastMessage ?? (d.username ? `@${d.username}` : d.type)}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>

        {peer ? (
          <Thread peer={peer} />
        ) : (
          <Card className="grid h-[70vh] place-items-center">
            <p className="text-sm text-muted-foreground">Selecione uma conversa à esquerda.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function Thread({ peer }: { peer: Dialogo }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listarMensagensPessoal);
  const sendFn = useServerFn(enviarMensagemPessoal);
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  const mensagens = useQuery({
    queryKey: ["tg-pessoal-msgs", peer.id],
    queryFn: () => listFn({ data: { peerId: peer.id } }),
    refetchInterval: 6000,
  });

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens.data?.length]);

  const enviar = useMutation({
    mutationFn: (t: string) => sendFn({ data: { peerId: peer.id, text: t } }),
    onSuccess: () => {
      setTexto("");
      qc.invalidateQueries({ queryKey: ["tg-pessoal-msgs", peer.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="flex h-[70vh] flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b">
        <div>
          <CardTitle className="text-base">{peer.title}</CardTitle>
          <CardDescription>{peer.username ? `@${peer.username}` : peer.type}</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["tg-pessoal-msgs", peer.id] })}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="flex-1 space-y-3 overflow-y-auto py-4">
        {mensagens.data?.map((m) => (
          <div key={m.id} className={m.out ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.out
                  ? "max-w-[75%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground"
                  : "max-w-[75%] rounded-2xl rounded-bl-sm bg-muted px-4 py-2 text-sm"
              }
            >
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
              <span className="mt-1 block text-[10px] opacity-70">
                {new Date(m.date).toLocaleString("pt-BR")}
              </span>
            </div>
          </div>
        ))}
        <div ref={fim} />
      </CardContent>

      <form
        className="flex gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const t = texto.trim();
          if (t) enviar.mutate(t);
        }}
      >
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escreva uma mensagem…"
          maxLength={4096}
        />
        <Button type="submit" disabled={enviar.isPending || !texto.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </Card>
  );
}
