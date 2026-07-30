import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Converte um contato em número E.164 (Brasil) apenas se parecer um telefone. */
export function normalizarTelefone(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 15) return null;
  if (digitos.length <= 11) return `55${digitos}`;
  return digitos;
}

interface WhatsAppLinkProps {
  numero: string | null | undefined;
  className?: string;
  /** Texto exibido; por padrão o próprio número */
  label?: string;
  showIcon?: boolean;
}

export function WhatsAppLink({ numero, className, label, showIcon = true }: WhatsAppLinkProps) {
  const e164 = normalizarTelefone(numero);
  if (!numero) return null;
  if (!e164) return <span className={className}>{label ?? numero}</span>;

  return (
    <a
      href={`https://wa.me/${e164}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Abrir conversa no WhatsApp"
      className={cn("inline-flex items-center gap-1 text-primary hover:underline", className)}
    >
      {showIcon && <MessageCircle className="h-3 w-3" />}
      {label ?? numero}
    </a>
  );
}
