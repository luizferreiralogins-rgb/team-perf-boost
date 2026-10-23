export function erroDeAcesso(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  return ["42501", "PGRST301", "session_not_found", "refresh_token_not_found"].includes(code);
}