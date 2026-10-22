import { z } from "zod";
import { applyEmailAction, emailTaskSummary, EMAIL_ACTIONS } from "./email-task";
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

/** Aplica o botão e devolve o resumo atualizado da tarefa. A caixa é sempre a do usuário autenticado. */
export async function runEmailStatus(user: Actor & { email: string }, raw: unknown, baseUrl: string) {
  const body = emailStatusBodySchema.parse(raw);
  const dueAt = body.dueAt ? parseLocalDateTime(body.dueAt) : null;
  if (body.dueAt && !dueAt) throw new BadRequest("Prazo inválido");
  const emailDate = body.email.emailDate ? new Date(body.email.emailDate) : null;

  await applyEmailAction(user, {
    to: body.to,
    note: body.note,
    title: body.title,
    responsibleId: body.responsibleId,
    requesterEmail: body.requesterEmail,
    dueAt,
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
