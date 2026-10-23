import { extractEmail } from "./address";
import { prisma } from "./db";
import { Actor, canViewTask, isAdmin } from "./permissions";
import { allowedTransitions, STATUS_LABEL } from "./status";
import { addNote, changeStatus, createTask, handoffTask, ServiceError, taskInclude, type EmailSourceInput, type ExecutionPeriod } from "./task-service";
import { elapsedMs, formatDateTime, formatDuration, isOverdue, type TaskStatusValue } from "./time";

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
    responsibleId: t.responsibleId,
    // Para sugerir o início ao concluir; a execução aparece depois de concluída.
    startedAt: t.startedAt?.toISOString() ?? null,
    execution: status === "CONCLUIDO" && t.startedAt && t.completedAt ? `${formatDateTime(t.startedAt)} até ${formatDateTime(t.completedAt)}` : null,
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
  /** Início e fim da execução (só em "Concluir"). */
  period?: ExecutionPeriod;
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
  if (task.status !== input.to) await changeStatus(actor, task.id, input.to, input.note ?? undefined, input.period);
  return task.id;
}

/** Tarefa (a mais recente) ligada à conversa (thread) da caixa do usuário. */
export async function taskForThread(actor: Actor & { email: string }, threadId: string) {
  const tasks = await prisma.task.findMany({
    where: { email: { threadId, mailbox: actor.email } },
    include: taskInclude,
    orderBy: { id: "desc" },
  });
  return tasks.find((t) => canViewTask(actor, t)) ?? null;
}

export interface AssignInput {
  responsibleId: string;
  /** Metadados do e-mail, quando foi possível lê-lo (permite criar a tarefa). */
  email?: EmailSourceInput | null;
  messageId?: string | null;
  threadId?: string | null;
  /** true = "Encaminhar e atribuir": a tarefa fica "Aberta" para o novo responsável. */
  reopen: boolean;
  note?: string | null;
}

/**
 * Atribui a tarefa do e-mail a um usuário. Procura a tarefa pela mensagem e,
 * se não achar, pela conversa. Se o e-mail ainda é "Nova" (sem tarefa), cria
 * a tarefa já "Aberta" com o novo responsável. Devolve o id da tarefa.
 */
export async function assignEmailTask(actor: Actor & { email: string }, input: AssignInput): Promise<number> {
  const messageId = input.email?.gmailMessageId ?? input.messageId ?? null;
  const threadId = input.email?.threadId ?? input.threadId ?? null;
  let task = messageId ? await taskForMessage(actor, messageId) : null;
  if (!task && threadId) task = await taskForThread(actor, threadId);

  if (task) {
    await handoffTask(actor, task.id, input.responsibleId, { reopen: input.reopen, note: input.note });
    return task.id;
  }
  if (!input.email) {
    throw new ServiceError("Não encontrei a tarefa deste e-mail. Abra o e-mail original, clique em \"Abrir tarefa\" e depois encaminhe.");
  }
  const now = new Date();
  const arrived = input.email.emailDate && input.email.emailDate <= now ? input.email.emailDate : now;
  const created = await createTask(
    actor,
    {
      title: (input.email.subject || "(sem assunto)").slice(0, 200).padEnd(3, "."),
      description: "",
      responsibleId: input.responsibleId,
      requesterEmail: extractEmail(input.email.sender) || input.email.mailbox,
      createdAt: arrived,
      dueAt: null,
      status: "ABERTA",
      completedAt: null,
    },
    input.email,
  );
  if (input.note?.trim()) await addNote(actor, created.id, input.note);
  return created.id;
}
