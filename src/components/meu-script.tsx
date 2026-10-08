import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const EVT = "meu-script-change";

export function saudacao(d = new Date()) {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

/** Primeiro nome "de verdade" (ignora números/CPF no início), capitalizado. */
export function primeiroNome(nome?: string | null) {
  const p = (nome ?? "").split(/\s+/).find((t) => /\p{L}/u.test(t)) ?? "";
  const limpo = p.replace(/[^\p{L}'-]/gu, "");
  return limpo ? limpo.charAt(0).toUpperCase() + limpo.slice(1).toLowerCase() : "";
}

function useEu() {
  return useQuery({
    queryKey: ["meu-script-eu"],
    queryFn: async () => {
      const { data: a } = await supabase.auth.getUser();
      const uid = a.user?.id ?? "";
      const { data } = await supabase.from("profiles").select("nome").eq("id", uid).maybeSingle();
      return { uid, nome: data?.nome ?? "" };
    },
    staleTime: Infinity,
  });
}

export type ScriptContexto = "pos-vendas" | "prospeccoes";

function useScriptSalvo(contexto: ScriptContexto) {
  const eu = useEu();
  const key = eu.data ? `meu-script:${contexto}:${eu.data.uid}` : null;
  const [texto, setTexto] = useState("");
  useEffect(() => {
    if (!key) return;
    const ler = () => setTexto(localStorage.getItem(key) ?? "");
    ler();
    window.addEventListener(EVT, ler);
    return () => window.removeEventListener(EVT, ler);
  }, [key]);
  const salvar = (v: string) => {
    if (!key) return;
    if (v) localStorage.setItem(key, v);
    else localStorage.removeItem(key);
    window.dispatchEvent(new Event(EVT));
  };
  return { texto, salvar, consultor: primeiroNome(eu.data?.nome), pronto: !!key };
}

function montar(cliente: string, consultor: string, script: string) {
  const c = primeiroNome(cliente);
  return `${saudacao()}${c ? ` ${c}` : ""}. Tudo bem? ${consultor} da Unifique aqui. ${script}`.trim();
}

export function MeuScript({ contexto }: { contexto: ScriptContexto }) {
  const { texto, salvar, consultor } = useScriptSalvo(contexto);
  const [rascunho, setRascunho] = useState("");
  useEffect(() => setRascunho(texto), [texto]);

  return (
    <div className="w-full max-w-xl space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <FileText className="h-4 w-4 text-primary" /> Meu script
      </div>
      <p className="text-xs text-muted-foreground">
        {saudacao()} (cliente). Tudo bem? {consultor || "(você)"} da Unifique aqui.
      </p>
      <Textarea
        rows={2}
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        placeholder="Continue o script. Ex.: Verifiquei que você iniciou uma contratação e não concluiu..."
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => { setRascunho(""); salvar(""); toast.success("Script limpo."); }}>
          Limpar
        </Button>
        <Button size="sm" disabled={!rascunho.trim() || rascunho === texto} onClick={() => { salvar(rascunho.trim()); toast.success("Script salvo."); }}>
          Salvar
        </Button>
      </div>
    </div>
  );
}

export function CopiarScript({ cliente, contexto }: { cliente: string; contexto: ScriptContexto }) {
  const { texto, consultor } = useScriptSalvo(contexto);
  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-7 w-7"
      title={texto ? "Copiar meu script para este cliente" : "Salve o seu script em 'Meu script' primeiro"}
      onClick={async (e) => {
        e.stopPropagation();
        if (!texto) return toast.error("Salve o seu script em 'Meu script' primeiro.");
        await navigator.clipboard.writeText(montar(cliente, consultor, texto));
        toast.success("Script copiado! É só colar no WhatsApp.");
      }}
    >
      <Copy className="h-4 w-4" />
    </Button>
  );
}
