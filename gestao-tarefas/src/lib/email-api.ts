import { z } from "zod";
import { applyEmailAction, assignEmailTask, emailTaskSummary, EMAIL_ACTIONS } from "./email-task";
import { gmailLink } from "./gmail";
import type { Actor } from "./permissions";
import { parseLocalDateTime, type TaskStatusValue } from "./time";

// Corpo da requisição dos botões (Abrir tarefa / Play / Concluir / Cancelar),
// compartilhado pelo complemento do Gmail e pela extensão do Chrome.

export const emailStatusBodySchema = z.object({
  to: z.enum(EMAIL_ACTIONS as [TaskStatusValue, ...TaskStatusValue[]]),
  note: z.string().max(5000).optional().nullable(),
  title: z.string().max(200).optional().nullable(),
  responsibleId: z.string().optional().nullable(),
  requesterEmail: z.string().max(320).optional().nullable(),
  dueAt: z.string().optional().nullable(), // "YYYY-MM-DD" (horário de Brasília)
  // Só em "Concluir": início e fim da execução, em ISO 8601 (instante absoluto).
  startedAt: z.string().max(40).optional().nullable(),
  completedAt: z.string().max(40).optional().nullable(),
  email: z.object({
    gmailMessageId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
    threadId: z.string().max(128).nullable().optional(),
    subject: z.string().max(1000),
    sender: z.string().max(1000),
    recipients: z.array(z.string().max(1000)).max(500),
    emailDate: z.string().nullable().optional(),
    direction: z.enum(["RECEBIDO", "ENVIADO"]),
  }),
});

export class BadRequest extends Error {}

const emailBodySchema = emailStatusBodySchema.shape.email;

// Corpo de "Atribuir" (extensão) e "Encaminhar e atribuir" (complemento).
export const assignBodySchema = z.object({
  responsibleId: z.string().min(1, "Escolha o usuário"),
  note: z.string().max(5000).optional().nullable(),
  email: emailBodySchema.optional().nullable(),
  messageId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/).optional().nullable(),
  threadId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/).optional().nullable(),
});

/** Converte os metadados enviados pelo Gmail no formato gravado (caixa e link montados aqui). */
function toEmailSource(user: { email: string }, e: z.infer<typeof emailBodySchema>) {
  const emailDate = e.emailDate ? new Date(e.emailDate) : null;
  return {
    gmailMessageId: e.gmailMessageId,
    threadId: e.threadId ?? null,
    subject: e.subject,
    sender: e.sender,
    recipients: e.recipients,
    emailDate: emailDate && !Number.isNaN(emailDate.getTime()) ? emailDate : null,
    direction: e.direction,
    mailbox: user.email,
    link: gmailLink(user.email, e.gmailMessageId),
  };
}

/** Atribui a tarefa do e-mail e devolve o resumo atualizado (ou null se não houver mensagem identificável). */
export async function runAssign(user: Actor & { email: string }, raw: unknown, baseUrl: string, reopen: boolean) {
  const body = assignBodySchema.parse(raw);
  const taskId = await assignEmailTask(user, {
    responsibleId: body.responsibleId,
    note: body.note,
    email: body.email ? toEmailSource(user, body.email) : null,
    messageId: body.messageId,
    threadId: body.threadId,
    reopen,
  });
  const messageId = body.email?.gmailMessageId ?? body.messageId;
  return { taskId, task: messageId ? await emailTaskSummary(user, messageId, baseUrl) : null };
}

function isoDate(value: string | null | undefined, error: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequest(error);
  return d;
}

/** Aplica o botão e devolve o resumo atualizado da tarefa. A caixa é sempre a do usuário autenticado. */
export async function runEmailStatus(user: Actor & { email: string }, raw: unknown, baseUrl: string) {
  const body = emailStatusBodySchema.parse(raw);
  const dueAt = body.dueAt ? parseLocalDateTime(body.dueAt) : null;
  if (body.dueAt && !dueAt) throw new BadRequest("Prazo inválido");
  const startedAt = isoDate(body.startedAt, "Início inválido");
  const completedAt = isoDate(body.completedAt, "Fim inválido");
  const emailDate = body.email.emailDate ? new Date(body.email.emailDate) : null;

  await applyEmailAction(user, {
    to: body.to,
    note: body.note,
    title: body.title,
    responsibleId: body.responsibleId,
    requesterEmail: body.requesterEmail,
    dueAt,
    period: body.to === "CONCLUIDO" ? { startedAt, completedAt } : undefined,
    email: {
      gmailMessageId: body.email.gmailMessageId,
      threadId: body.email.threadId ?? null,
      subject: body.email.subject,
      sender: body.email.sender,
      recipients: body.email.recipients,
      emailDate: emailDate && !Number.isNaN(emailDate.getTime()) ? emailDate : null,
      direction: body.email.direction,
      mailbox: user.email,
      link: gmailLink(user.email, body.email.gmailMessageId),
    },
  });
  return emailTaskSummary(user, body.email.gmailMessageId, baseUrl);
}
