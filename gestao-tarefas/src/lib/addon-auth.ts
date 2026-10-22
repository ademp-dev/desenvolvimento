import { OAuth2Client } from "google-auth-library";
import { addonClientIds, adminEmails, isAllowedAccount } from "./config";
import { prisma } from "./db";

// Autenticação das chamadas do complemento do Gmail.
// O complemento (Apps Script) envia "Authorization: Bearer <ID token>",
// obtido com ScriptApp.getIdentityToken(). O token é assinado pelo Google e
// verificado aqui: assinatura, validade, audience (client ID do projeto
// Apps Script), e-mail verificado e domínio Workspace.

const client = new OAuth2Client();

export class AddonAuthError extends Error {
  constructor(
    message: string,
    public status = 401,
  ) {
    super(message);
  }
}

export async function authenticateAddon(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!idToken) throw new AddonAuthError("Token ausente");
  const audience = addonClientIds();
  if (audience.length === 0) throw new AddonAuthError("Complemento não configurado (ADDON_OAUTH_CLIENT_IDS)", 503);

  let payload;
  try {
    payload = (await client.verifyIdToken({ idToken, audience })).getPayload();
  } catch {
    throw new AddonAuthError("Token inválido");
  }
  if (!payload?.email || !payload.email_verified || !isAllowedAccount(payload.email, payload.hd)) {
    throw new AddonAuthError("Conta não autorizada", 403);
  }

  const email = payload.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && !existing.active) throw new AddonAuthError("Usuário desativado", 403);
  if (existing) return existing;

  // Primeiro acesso pelo complemento: cria o usuário como no login web.
  return prisma.user.create({
    data: {
      email,
      googleSub: payload.sub,
      name: payload.name || email,
      image: payload.picture,
      role: adminEmails().includes(email) ? "ADMIN" : "USER",
      lastLogin: new Date(),
    },
  });
}
