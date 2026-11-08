import { prisma } from "./db";
import { decrypt, encrypt } from "./crypto";
import { GMAIL_READONLY_SCOPE, GMAIL_SEND_SCOPE } from "./config";

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

export async function hasGmailAccess(userId: string, scope: string = GMAIL_READONLY_SCOPE): Promise<boolean> {
  const t = await prisma.googleToken.findUnique({ where: { userId } });
  return !!t && t.scope.split(" ").includes(scope) && (!!t.refreshToken || (t.expiresAt?.getTime() ?? 0) > Date.now());
}

/** O usuário autorizou o app a enviar e-mail pela caixa dele? */
export const hasGmailSendAccess = (userId: string) => hasGmailAccess(userId, GMAIL_SEND_SCOPE);

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

// --- Envio -------------------------------------------------------------------------

/** Cabeçalho com acentos (RFC 2047); remove quebras de linha para evitar injeção de cabeçalhos. */
function encodeHeader(value: string): string {
  const clean = value.replace(/[\r\n]+/g, " ").trim();
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

const base64Lines = (data: Buffer | string) =>
  (Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8")).toString("base64").replace(/.{76}/g, "$&\r\n");

export interface OutgoingEmail {
  from: { name: string; email: string };
  to: string[];
  subject: string;
  text: string;
  attachment?: { filename: string; contentType: string; data: Uint8Array };
}

/** Monta a mensagem MIME (texto + anexo opcional). */
export function buildMime(m: OutgoingEmail): string {
  const boundary = `tarefas-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const safeName = (m.attachment?.filename ?? "").replace(/["\r\n]/g, "");
  const lines = [
    `From: ${encodeHeader(m.from.name)} <${m.from.email}>`,
    `To: ${m.to.join(", ")}`,
    `Subject: ${encodeHeader(m.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(m.text),
  ];
  if (m.attachment) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${m.attachment.contentType}; name="${safeName}"`,
      `Content-Disposition: attachment; filename="${safeName}"`,
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(Buffer.from(m.attachment.data)),
    );
  }
  lines.push(`--${boundary}--`, "");
  return lines.join("\r\n");
}

/**
 * Envia pela caixa do PRÓPRIO usuário (a mensagem fica em "Enviados").
 * Usa o endpoint de upload, que aceita anexos de até 35 MB.
 */
export async function sendGmail(userId: string, m: OutgoingEmail): Promise<void> {
  const token = await accessToken(userId);
  const res = await fetch("https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "message/rfc822" },
    body: buildMime(m),
  });
  if (res.status === 401 || res.status === 403) throw new GmailNotAuthorizedError();
  if (!res.ok) throw new Error(`Gmail API: ${res.status} ${await res.text()}`);
}
