import { prisma } from "./db";
import { decrypt, encrypt } from "./crypto";
import { GMAIL_READONLY_SCOPE } from "./config";

// Acesso à Gmail API em nome do PRÓPRIO usuário logado. Não existe nenhuma
// função que leia a caixa de outra pessoa: o token usado é sempre o do
// usuário que faz a requisição.

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailNotAuthorizedError extends Error {
  constructor() {
    super("Acesso ao Gmail não autorizado");
  }
}

export interface EmailMetadata {
  gmailMessageId: string;
  threadId: string | null;
  subject: string;
  sender: string;
  recipients: string[];
  emailDate: Date | null;
  direction: "RECEBIDO" | "ENVIADO";
  snippet: string;
  link: string;
  mailbox: string;
}

export async function hasGmailAccess(userId: string): Promise<boolean> {
  const t = await prisma.googleToken.findUnique({ where: { userId } });
  return !!t && t.scope.split(" ").includes(GMAIL_READONLY_SCOPE) && (!!t.refreshToken || (t.expiresAt?.getTime() ?? 0) > Date.now());
}

async function accessToken(userId: string): Promise<string> {
  const t = await prisma.googleToken.findUnique({ where: { userId } });
  if (!t) throw new GmailNotAuthorizedError();
  if (t.expiresAt && t.expiresAt.getTime() - 60_000 > Date.now()) return decrypt(t.accessToken);
  if (!t.refreshToken) throw new GmailNotAuthorizedError();

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: "refresh_token",
      refresh_token: decrypt(t.refreshToken),
    }),
  });
  if (!res.ok) {
    // Token revogado pelo usuário: descarta para pedir autorização de novo.
    await prisma.googleToken.delete({ where: { userId } }).catch(() => {});
    throw new GmailNotAuthorizedError();
  }
  const json = (await res.json()) as { access_token: string; expires_in: number; scope?: string };
  await prisma.googleToken.update({
    where: { userId },
    data: {
      accessToken: encrypt(json.access_token),
      expiresAt: new Date(Date.now() + json.expires_in * 1000),
      ...(json.scope ? { scope: json.scope } : {}),
    },
  });
  return json.access_token;
}

async function gmailGet<T>(userId: string, path: string): Promise<T> {
  const token = await accessToken(userId);
  const res = await fetch(`${GMAIL_API}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (res.status === 401 || res.status === 403) throw new GmailNotAuthorizedError();
  if (!res.ok) throw new Error(`Gmail API: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Divide uma lista de endereços respeitando vírgulas dentro de aspas. */
export function splitAddresses(value: string | undefined): string[] {
  if (!value) return [];
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of value) {
    if (ch === '"') quoted = !quoted;
    if (ch === "," && !quoted) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function gmailLink(mailbox: string, messageId: string): string {
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(mailbox)}#all/${encodeURIComponent(messageId)}`;
}

interface GmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[] };
}

function toMetadata(m: GmailMessage, mailbox: string): EmailMetadata {
  const h = (name: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value;
  const internal = m.internalDate ? new Date(Number(m.internalDate)) : null;
  return {
    gmailMessageId: m.id,
    threadId: m.threadId ?? null,
    subject: h("Subject") || "(sem assunto)",
    sender: h("From") || "",
    recipients: [...splitAddresses(h("To")), ...splitAddresses(h("Cc"))],
    emailDate: internal,
    direction: m.labelIds?.includes("SENT") ? "ENVIADO" : "RECEBIDO",
    snippet: m.snippet ?? "",
    link: gmailLink(mailbox, m.id),
    mailbox,
  };
}

const METADATA_QS = "format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Date";

export async function getMessage(userId: string, mailbox: string, messageId: string): Promise<EmailMetadata> {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(messageId)) throw new Error("ID de mensagem inválido");
  const m = await gmailGet<GmailMessage>(userId, `/messages/${messageId}?${METADATA_QS}`);
  return toMetadata(m, mailbox);
}

/** Pesquisa (mesma sintaxe da busca do Gmail) na caixa do próprio usuário. */
export async function searchMessages(
  userId: string,
  mailbox: string,
  q: string,
  pageToken?: string,
): Promise<{ messages: EmailMetadata[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ maxResults: "20", q });
  if (pageToken) params.set("pageToken", pageToken);
  const list = await gmailGet<{ messages?: { id: string }[]; nextPageToken?: string }>(userId, `/messages?${params}`);
  const messages = await Promise.all(
    (list.messages ?? []).map((m) => gmailGet<GmailMessage>(userId, `/messages/${m.id}?${METADATA_QS}`)),
  );
  return { messages: messages.map((m) => toMetadata(m, mailbox)), nextPageToken: list.nextPageToken };
}
