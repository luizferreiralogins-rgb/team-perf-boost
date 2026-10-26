// Abre a Assyst em nova aba com o protocolo já copiado para a área de transferência.
export const URL_ASSYST =
  "https://assyst.unifique.com.br/assystweb/application.do#welcome%2FWelcomeDispatchAction.do?dispatch=refresh";

export type ResultadoAssyst = "copiado" | "nao_copiado";

type Dependencias = {
  copiar?: (texto: string) => Promise<boolean> | boolean;
  abrir?: (url: string) => void;
};

export async function copiarEAbrirAssyst(
  protocolo: string,
  deps: Dependencias = {},
): Promise<ResultadoAssyst> {
  const copiar = deps.copiar ?? copiarTexto;
  const abrir = deps.abrir ?? ((url: string) => window.open(url, "_blank", "noopener,noreferrer"));
  const copiado = await copiar(protocolo);
  abrir(URL_ASSYST);
  return copiado ? "copiado" : "nao_copiado";
}

async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return copiarViaCampoOculto(texto);
  }
}

// Fallback para navegadores/contextos em que a área de transferência direta é bloqueada.
function copiarViaCampoOculto(texto: string): boolean {
  try {
    const campo = document.createElement("textarea");
    campo.value = texto;
    campo.setAttribute("readonly", "");
    campo.style.position = "fixed";
    campo.style.top = "-1000px";
    campo.style.opacity = "0";
    document.body.appendChild(campo);
    campo.select();
    const ok = document.execCommand("copy");
    campo.remove();
    return ok;
  } catch {
    return false;
  }
}
