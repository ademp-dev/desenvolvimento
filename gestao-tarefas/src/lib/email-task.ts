import { extractEmail } from "./address";
import { prisma } from "./db";
import { Actor, canViewTask, isAdmin } from "./permissions";
import { allowedTransitions, STATUS_LABEL } from "./status";
import { changeStatus, createTask, ServiceError, taskInclude, type EmailSourceInput } from "./task-service";
import { elapsedMs, formatDuration, isOverdue, type TaskStatusValue } from "./time";

// Fluxo dos botões do complemento do Gmail. Todo e-mail "nasce" como Nova:
// a tarefa só é gravada no primeiro clique (Abrir tarefa, Play, Concluir ou
// Cancelar). A data da criação é a de chegada do e-mail, para o tempo
// decorrido refletir há quanto tempo o pedido espera.

/** Status que os botões podem aplicar. */
export const EMAIL_ACTIONS: TaskStatusValue[] = ["ABERTA", "EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"];

/** Tarefa (a mais recente) ligada à mensagem e visível ao usuário. */
export async function taskForMessage(actor: Actor, gmailMessageId: string) {
  const tasks = await prisma.task.findMany({ where: { email: { gmailMessageId } }, include: taskInclude, orderBy: { id: "desc" } });
  return tasks.find((t) => canViewTask(actor, t)) ?? null;
}

/** Resumo da tarefa para o cartão do Gmail; `null` quando o e-mail ainda é "Nova" (sem tarefa). */
export async function emailTaskSummary(actor: Actor, gmailMessageId: string, baseUrl: string, now = new Date()) {
  const t = await taskForMessage(actor, gmailMessageId);
  if (!t) return null;
  const status = t.status as TaskStatusValue;
  return {
    id: t.id,
    title: t.title,
    status,
    statusLabel: STATUS_LABEL[status],
    elapsed: formatDuration(elapsedMs(t, now)),
    overdue: isOverdue(t, now),
    responsible: t.responsible.name,
    url: `${baseUrl}/tarefas/${t.id}`,
    allowed: allowedTransitions(status, isAdmin(actor)).filter((s) => EMAIL_ACTIONS.includes(s)),
  };
}

export interface EmailActionInput {
  to: TaskStatusValue;
  note?: string | null;
  email: EmailSourceInput;
  /** Usados só quando a tarefa ainda não existe. */
  title?: string | null;
  responsibleId?: string | null;
  requesterEmail?: string | null;
  dueAt?: Date | null;
}

/** Aplica o botão clicado: cria a tarefa (se preciso) e muda o status. Devolve o id. */
export async function applyEmailAction(actor: Actor, input: EmailActionInput): Promise<number> {
  if (!EMAIL_ACTIONS.includes(input.to)) throw new ServiceError("Ação inválida");
  if (input.to === "CANCELADO" && !input.note?.trim()) throw new ServiceError("Informe o motivo do cancelamento");

  let task = await taskForMessage(actor, input.email.gmailMessageId);
  if (!task) {
    const now = new Date();
    const arrived = input.email.emailDate && input.email.emailDate <= now ? input.email.emailDate : now;
    const created = await createTask(
      actor,
      {
        title: (input.title?.trim() || input.email.subject || "(sem assunto)").slice(0, 200).padEnd(3, "."),
        description: "",
        responsibleId: input.responsibleId || actor.id,
        requesterEmail: input.requesterEmail?.trim() || extractEmail(input.email.sender) || input.email.mailbox,
        createdAt: arrived,
        dueAt: input.dueAt ?? null,
        status: "CRIADO",
        completedAt: null,
      },
      input.email,
    );
    task = await prisma.task.findUniqueOrThrow({ where: { id: created.id }, include: taskInclude });
  }
  if (task.status !== input.to) await changeStatus(actor, task.id, input.to, input.note ?? undefined);
  return task.id;
}
