import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Copy, Settings2 } from "lucide-react";
import { toast } from "sonner";

import {
  minhaContaWhatsapp,
  removerContaWhatsapp,
  salvarContaWhatsapp,
} from "@/lib/whatsapp.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const WEBHOOK_URL = "https://team-perf-boost.lovable.app/api/public/whatsapp/meta";

function Copiar({ valor }: { valor: string }) {
  return (
    <div className="flex gap-2">
      <Input readOnly value={valor} className="font-mono text-xs" />
      <Button
        type="button"
        size="icon"
        variant="outline"
        onClick={() => {
          navigator.clipboard.writeText(valor);
          toast.success("Copiado");
        }}
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function MinhaContaWhatsapp({ trigger }: { trigger?: React.ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [passos, setPassos] = useState(false);
  const [form, setForm] = useState({ phoneNumberId: "", accessToken: "", appSecret: "" });
  const conta = useQuery({ queryKey: ["whatsapp-minha-conta"], queryFn: useServerFn(minhaContaWhatsapp) });
  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ["whatsapp-minha-conta"] });
    qc.invalidateQueries({ queryKey: ["whatsapp-configurado"] });
  };
  const salvar = useMutation({
    mutationFn: useServerFn(salvarContaWhatsapp),
    onSuccess: (r: any) => {
      toast.success(`WhatsApp ${r.numero ?? ""} conectado!`);
      setForm({ phoneNumberId: "", accessToken: "", appSecret: "" });
      atualizar();
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível conectar."),
  });
  const remover = useMutation({
    mutationFn: useServerFn(removerContaWhatsapp),
    onSuccess: () => {
      toast.success("WhatsApp desconectado");
      atualizar();
    },
  });
  const c = conta.data;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Settings2 className="mr-1 h-4 w-4" /> Meu WhatsApp
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Meu WhatsApp Business</DialogTitle>
        </DialogHeader>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-between"
          onClick={() => setPassos((v) => !v)}
        >
          <span>Passo a passo na Meta (criar app e coletar os dados)</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${passos ? "rotate-180" : ""}`} />
        </Button>
        {passos && (
          <ol className="list-decimal space-y-2 rounded-md border p-3 pl-5 text-sm">
            <li>
              Acesse <strong>developers.facebook.com</strong> e entre com sua conta Meta (se for a
              primeira vez, conclua o cadastro em "Registrar como desenvolvedor").
            </li>
            <li>
              Em <strong>Meus aplicativos → Criar app</strong>, escolha o caso de uso{" "}
              <strong>"Conectar-se com clientes pelo WhatsApp"</strong>, dê um nome ao app (ex.:
              "WhatsApp — Seu Nome"), informe seu e-mail, selecione ou crie seu portfólio
              comercial e clique em <strong>Criar app</strong>.
            </li>
            <li>
              <strong>ID do número de telefone:</strong> no menu do app, abra{" "}
              <strong>WhatsApp → API Setup</strong>, clique em "Adicionar número de telefone",
              cadastre seu número e verifique por SMS ou ligação. O ID aparece logo abaixo do
              número — copie-o aqui.
            </li>
            <li>
              <strong>Token de acesso permanente:</strong> acesse{" "}
              <strong>business.facebook.com → Configurações → Usuários → Usuários do sistema</strong>
              , clique em <strong>Adicionar</strong>, dê um nome (ex.: "Token WhatsApp"), escolha a
              função <strong>Administrador</strong> e crie. Depois clique em{" "}
              <strong>Gerar novo token</strong> para esse usuário, selecione o app, marque as
              permissões <strong>whatsapp_business_messaging</strong>,{" "}
              <strong>whatsapp_business_management</strong> e{" "}
              <strong>business_management</strong> e gere o token. Copie-o imediatamente (só é
              exibido uma vez).
            </li>
            <li>
              <strong>Chave secreta do app:</strong> de volta ao painel do app em{" "}
              <strong>developers.facebook.com</strong>, abra{" "}
              <strong>Configurações do app → Básico</strong> e copie a{" "}
              <strong>"Chave secreta do aplicativo"</strong> (pedirá sua senha para mostrar).
            </li>
            <li>
              Cole os três dados abaixo e clique em <strong>Conectar meu WhatsApp</strong>.
            </li>
            <li>
              Após conectar, copie a <strong>URL de retorno</strong> e o{" "}
              <strong>Token de verificação</strong> exibidos e cadastre no painel da Meta em{" "}
              <strong>WhatsApp → Configuração → Webhook</strong>, assinando também o campo{" "}
              <strong>messages</strong>.
            </li>
          </ol>
        )}

        {c && (
          <div className="space-y-3 rounded-md border p-3 text-sm">
            <p>
              Conectado: <strong>{c.numero_exibicao ?? c.phone_number_id}</strong>
            </p>
            <p className="text-muted-foreground">
              No painel da Meta (WhatsApp → Configuração → Webhook), use os dados abaixo e assine o
              campo <strong>messages</strong>:
            </p>
            <div className="space-y-1">
              <Label className="text-xs">URL de retorno</Label>
              <Copiar valor={WEBHOOK_URL} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Token de verificação</Label>
              <Copiar valor={c.verify_token} />
            </div>
            <Button variant="destructive" size="sm" onClick={() => remover.mutate({})} disabled={remover.isPending}>
              Desconectar
            </Button>
          </div>
        )}

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate({ data: form });
          }}
        >
          <p className="text-sm text-muted-foreground">
            {c ? "Para trocar de número, preencha novamente:" : "Informe os dados do seu app no painel da Meta (developers.facebook.com → seu app → WhatsApp → Configuração da API):"}
          </p>
          <div className="space-y-1">
            <Label>ID do número de telefone</Label>
            <Input
              value={form.phoneNumberId}
              onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })}
              placeholder="Ex.: 123456789012345"
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Token de acesso permanente</Label>
            <Input
              type="password"
              value={form.accessToken}
              onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Chave secreta do app</Label>
            <Input
              type="password"
              value={form.appSecret}
              onChange={(e) => setForm({ ...form, appSecret: e.target.value })}
              placeholder="Configurações do app → Básico"
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Os dados ficam guardados de forma criptografada e só são usados para enviar e receber as suas mensagens.
          </p>
          <Button type="submit" disabled={salvar.isPending} className="w-full">
            {salvar.isPending ? "Validando..." : c ? "Atualizar conexão" : "Conectar meu WhatsApp"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
