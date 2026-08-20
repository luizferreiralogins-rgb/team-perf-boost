import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  startQrLogin,
  pollQrLogin,
  submit2faPassword,
  syncTelegram,
  disconnectTelegram,
  telegramServiceStatus,
  type QrState,
  type TelegramStatus,
} from "@/lib/telegram.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const LABELS: Record<TelegramStatus, string> = {
  desconectado: "Não conectado",
  aguardando_qr: "Aguardando leitura do QR Code",
  qr_lido: "QR Code lido — autorizando",
  aguardando_2fa: "Verificação em duas etapas necessária",
  conectado: "Telegram conectado",
  erro: "Erro de autenticação",
};

export function useTelegramAccount() {
  return useQuery({
    queryKey: ["telegram-account"],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) return null;
      const { data } = await supabase
        .from("telegram_accounts")
        .select("*")
        .eq("crm_user_id", uid)
        .maybeSingle();
      return data;
    },
  });
}

export function TelegramIntegracao() {
  const qc = useQueryClient();
  const { data: account, isLoading } = useTelegramAccount();
  const { data: service } = useQuery({
    queryKey: ["telegram-service-status"],
    queryFn: () => telegramServiceStatus(),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const disconnectFn = useServerFn(disconnectTelegram);
  const syncFn = useServerFn(syncTelegram);

  const conectado = account?.status === "conectado";
  const nome = [account?.first_name, account?.last_name].filter(Boolean).join(" ");

  async function sincronizar() {
    setSyncing(true);
    try {
      const r = await syncFn({});
      toast.success(`Sincronizado: ${r.chats} conversas e ${r.contacts} contatos.`);
      qc.invalidateQueries({ queryKey: ["telegram-account"] });
      qc.invalidateQueries({ queryKey: ["telegram-chats"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao sincronizar.");
    } finally {
      setSyncing(false);
    }
  }

  async function desconectar() {
    if (!window.confirm("Desconectar sua conta pessoal do Telegram deste CRM?")) return;
    try {
      await disconnectFn({});
      toast.success("Telegram desconectado.");
      qc.invalidateQueries({ queryKey: ["telegram-account"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao desconectar.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Telegram</CardTitle>
        <CardDescription>
          Conecte sua conta pessoal do Telegram por QR Code para usar suas conversas dentro do CRM.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span>{conectado ? "🟢" : account?.status === "erro" ? "🔴" : "🔴"}</span>
              <span>{LABELS[(account?.status as TelegramStatus) ?? "desconectado"]}</span>
            </div>
            {conectado && (
              <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                {account?.username && <div>@{account.username}</div>}
                {nome && <div>{nome}</div>}
                <div>
                  Última sincronização:{" "}
                  {account?.last_sync_at
                    ? new Date(account.last_sync_at).toLocaleString("pt-BR")
                    : "—"}
                </div>
              </div>
            )}
            {account?.last_error && !conectado && (
              <p className="mt-2 text-sm text-destructive">{account.last_error}</p>
            )}
          </div>
        )}

        {service && !service.configured && (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            O Telegram Service (TDLib) ainda não está hospedado/configurado. Enquanto isso a conexão
            real não pode ser estabelecida — nada aqui é simulado. Consulte{" "}
            <code>docs/telegram-service.md</code> para hospedar o serviço e cadastrar
            <code> TELEGRAM_SERVICE_URL</code> e <code>TELEGRAM_SERVICE_TOKEN</code>.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!conectado && <Button onClick={() => setDialogOpen(true)}>Conectar Telegram</Button>}
          {conectado && (
            <>
              <Button asChild>
                <Link to="/telegram">Abrir Telegram</Link>
              </Button>
              <Button variant="outline" onClick={sincronizar} disabled={syncing}>
                {syncing ? "Sincronizando..." : "Sincronizar contatos"}
              </Button>
              <Button variant="outline" onClick={desconectar}>
                Desconectar
              </Button>
            </>
          )}
        </div>
      </CardContent>

      <QrDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </Card>
  );
}

function QrDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const start = useServerFn(startQrLogin);
  const poll = useServerFn(pollQrLogin);
  const send2fa = useServerFn(submit2faPassword);

  const [state, setState] = useState<QrState>({ status: "desconectado" });
  const [senha, setSenha] = useState("");
  const [enviando2fa, setEnviando2fa] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) {
      if (timer.current) clearInterval(timer.current);
      setState({ status: "desconectado" });
      setSenha("");
      return;
    }
    let cancelled = false;
    (async () => {
      const s = await start({});
      if (!cancelled) setState(s);
    })();
    timer.current = setInterval(async () => {
      const s = await poll({});
      if (cancelled) return;
      setState(s);
      if (s.status === "conectado") {
        if (timer.current) clearInterval(timer.current);
        qc.invalidateQueries({ queryKey: ["telegram-account"] });
        toast.success("Telegram conectado.");
        onOpenChange(false);
      }
    }, 2500);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [open, start, poll, qc, onOpenChange]);

  async function confirmar2fa(e: React.FormEvent) {
    e.preventDefault();
    setEnviando2fa(true);
    try {
      const s = await send2fa({ data: { password: senha } });
      setSenha("");
      setState(s);
      if (s.status === "conectado") {
        qc.invalidateQueries({ queryKey: ["telegram-account"] });
        onOpenChange(false);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Falha na verificação em duas etapas.");
    } finally {
      setEnviando2fa(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar Telegram</DialogTitle>
          <DialogDescription>{LABELS[state.status]}</DialogDescription>
        </DialogHeader>

        {state.status === "aguardando_2fa" ? (
          <form onSubmit={confirmar2fa} className="space-y-3">
            <div>
              <Label htmlFor="tg-2fa">Senha da verificação em duas etapas</Label>
              <Input
                id="tg-2fa"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                A senha é usada apenas para autorizar a sessão e não é armazenada.
              </p>
            </div>
            <Button type="submit" disabled={enviando2fa || !senha}>
              {enviando2fa ? "Autorizando..." : "Autorizar"}
            </Button>
          </form>
        ) : state.qrUrl ? (
          <div className="space-y-4">
            <div className="flex justify-center rounded-lg border bg-card p-4">
              <QRCodeCanvas value={state.qrUrl} size={200} />
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Abra o Telegram no seu celular</li>
              <li>Configurações → Dispositivos → Conectar dispositivo</li>
              <li>Escaneie o QR Code acima</li>
            </ol>
            {state.expiresAt && (
              <p className="text-xs text-muted-foreground">
                O código é renovado automaticamente ao expirar.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : (
              <Skeleton className="h-48 w-full" />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
