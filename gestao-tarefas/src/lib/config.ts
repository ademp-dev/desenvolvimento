// Configuração lida das variáveis de ambiente.

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function allowedDomain(): string {
  return (process.env.ALLOWED_DOMAIN || "").trim().toLowerCase();
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function addonClientIds(): string[] {
  return (process.env.ADDON_OAUTH_CLIENT_IDS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

/** URL pública do app (AUTH_URL), ou a origem da requisição como alternativa. */
export function appBaseUrl(req: Request): string {
  return process.env.AUTH_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
}

/** A conta pertence ao domínio Google Workspace autorizado? */
export function isAllowedAccount(email: string | null | undefined, hd: string | null | undefined): boolean {
  const domain = allowedDomain();
  if (!email || !domain) return false;
  const e = email.toLowerCase();
  return e.endsWith(`@${domain}`) && (hd ?? "").toLowerCase() === domain;
}
