import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copiarEAbrirAssyst } from "@/lib/assyst";

// Número do protocolo clicável: copia o número e abre a Assyst em nova aba.
export function ProtocoloAssyst({ protocolo }: { protocolo?: string | null }) {
  if (!protocolo) return <>—</>;
  return (
    <Button
      type="button"
      variant="link"
      className="h-auto gap-1 p-0 text-xs font-medium hover:underline"
      title="Copiar o protocolo e abrir a Assyst"
      onClick={async () => {
        const resultado = await copiarEAbrirAssyst(protocolo);
        if (resultado === "copiado") {
          toast.success(`Protocolo ${protocolo} copiado. A Assyst abriu em nova aba — é só colar na pesquisa.`);
        } else {
          toast.warning(`A Assyst abriu em nova aba, mas não consegui copiar o protocolo ${protocolo}. Copie-o manualmente.`);
        }
      }}
    >
      {protocolo}
      <Copy className="h-3 w-3" />
    </Button>
  );
}
