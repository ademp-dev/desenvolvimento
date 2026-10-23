import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { Actor, canEditTask, canViewTask, isAdmin } from "./permissions";
import { canTransition, INITIAL_STATUSES, statusTimestamps, STATUS_LABEL } from "./status";
import { formatDateTime, isOpen, type TaskStatusValue } from "./time";

// Regras de negócio das tarefas. Toda alteração grava o histórico de
// auditoria na mesma transação.

export class ServiceError extends Error {}

/** Tolerância para relógios levemente adiantados ao validar "não pode ser futura". */
const CLOCK_SKEW_MS = 2 * 60_000;

export const taskInputSchema = z.object({
  title: z.string().trim().min(3, "O título deve ter ao menos 3 caracteres").max(200, "Título muito longo"),
  description: z.string().trim().max(10_000, "Descrição muito longa").default(""),
  responsibleId: z.string().min(1, "Informe o responsável"),
  requesterEmail: z.string().trim().toLowerCase().email("Informe um e-mail válido para o solicitante"),
  createdAt: z.date(),
  dueAt: z.date().nullable(),
});
export type TaskInput = z.infer<typeof taskInputSchema>;

export const createTaskSchema = taskInputSchema.extend({
  status: z.enum(INITIAL_STATUSES as [TaskStatusValue, ...TaskStatusValue[]]),
  completedAt: z.date().nullable(),
  /** Início da execução (só para status Concluída); vazio = data da criação. */
  startedAt: z.date().nullable().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const emailSourceSchema = z.object({
  gmailMessageId: z.string().trim().min(1).max(128),
  threadId: z.string().trim().max(128).nullable(),
  subject: z.string().trim().max(1000),
  sender: z.string().trim().max(1000),
  recipients: z.array(z.string().trim().max(1000)).max(500),
  emailDate: z.date().nullable(),
  link: z.string().url().refine((u) => u.startsWith("https://mail.google.com/"), "Link do Gmail inválido"),
  mailbox: z.string().email(),
  direction: z.enum(["RECEBIDO", "ENVIADO"]),
});
export type EmailSourceInput = z.infer<typeof emailSourceSchema>;

export const taskInclude = {
  responsible: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  email: true,
} satisfies Prisma.TaskInclude;

export type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

/** Solicitante: sempre o e-mail; `name` vem do usuário cadastrado com aquele e-mail, se houver. */
export interface Requester {
  email: string;
  name: string | null;
}
export type TaskRow = TaskWithRelations & { requester: Requester | null };

/** Acrescenta o solicitante (com o nome do usuário cadastrado, quando existir). */
export async function withRequesters<T extends { requesterEmail: string | null }>(tasks: T[]): Promise<(T & { requester: Requester | null })[]> {
  const emails = [...new Set(tasks.map((t) => t.requesterEmail).filter((e): e is string => !!e))];
  const users = emails.length ? await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.email, u.name]));
  return tasks.map((t) => ({
    ...t,
    requester: t.requesterEmail ? { email: t.requesterEmail, name: names.get(t.requesterEmail) ?? null } : null,
  }));
}

const userLabel = (u: { name: string; email: string }) => `${u.name} <${u.email}>`;

function assertNotFuture(d: Date, field: string) {
  if (d.getTime() > Date.now() + CLOCK_SKEW_MS) throw new ServiceError(`${field} não pode ser no futuro`);
}

async function activeUser(id: string) {
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u || !u.active) throw new ServiceError("Responsável inválido ou inativo");
  return u;
}

async function loadEditable(actor: Actor, id: number) {
  const task = await prisma.task.findUnique({ where: { id }, include: taskInclude });
  if (!task || !canViewTask(actor, task)) throw new ServiceError("Tarefa não encontrada");
  if (!canEditTask(actor, task)) throw new ServiceError("Sem permissão para alterar esta tarefa");
  return task;
}

export async function getTaskForUser(actor: Actor, id: number) {
  if (!Number.isInteger(id)) return null;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      ...taskInclude,
      notes: { include: { author: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" } },
      history: { include: { author: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!task || !canViewTask(actor, task)) return null;
  return (await withRequesters([task]))[0];
}

export async function createTask(actor: Actor, rawInput: CreateTaskInput, rawEmail?: EmailSourceInput) {
  const input = createTaskSchema.parse(rawInput);
  const email = rawEmail ? emailSourceSchema.parse(rawEmail) : undefined;
  const responsible = await activeUser(input.responsibleId);

  assertNotFuture(input.createdAt, "A data de criação");
  let completedAt: Date | null = null;
  let startedAt: Date | null = input.status === "EM_ANDAMENTO" ? input.createdAt : null;
  if (input.status === "CONCLUIDO") {
    if (!input.completedAt) throw new ServiceError("Informe a data de conclusão");
    assertNotFuture(input.completedAt, "A data de conclusão");
    if (input.completedAt < input.createdAt) throw new ServiceError("A conclusão não pode ser anterior à criação");
    completedAt = input.completedAt;
    startedAt = input.startedAt ?? input.createdAt;
    if (startedAt < input.createdAt) throw new ServiceError("O início não pode ser anterior à criação");
    if (startedAt > completedAt) throw new ServiceError("O início não pode ser depois da conclusão");
  }
  const now = new Date();
  const backdated = now.getTime() - input.createdAt.getTime() > 5 * 60_000;

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        title: input.title,
        description: input.description,
        dueAt: input.dueAt,
        origin: email ? "EMAIL" : "MANUAL",
        status: input.status,
        createdAt: input.createdAt,
        startedAt,
        completedAt,
        requesterEmail: input.requesterEmail,
        responsibleId: responsible.id,
        createdById: actor.id,
        ...(email ? { email: { create: email } } : {}),
      },
    });
    await tx.taskHistory.create({
      data: {
        taskId: task.id,
        authorId: actor.id,
        action: "CRIACAO",
        createdAt: now,
        newValue: [
          email ? "Criada a partir de e-mail" : "Cadastro manual",
          `status inicial: ${STATUS_LABEL[input.status]}`,
          `solicitante: ${input.requesterEmail}`,
          `responsável: ${userLabel(responsible)}`,
          ...(backdated ? [`data de criação informada: ${formatDateTime(input.createdAt)}`] : []),
        ].join(" · "),
      },
    });
    return task;
  });
}

export async function updateTask(actor: Actor, id: number, rawInput: TaskInput) {
  const input = taskInputSchema.parse(rawInput);
  const task = await loadEditable(actor, id);
  if (!isOpen(task.status as TaskStatusValue)) {
    throw new ServiceError("Tarefas encerradas não podem ser editadas. Um administrador pode reabri-las.");
  }
  assertNotFuture(input.createdAt, "A data de criação");

  const changes: { action: string; field: string; oldValue: string; newValue: string }[] = [];
  if (input.title !== task.title) changes.push({ action: "EDICAO", field: "Título", oldValue: task.title, newValue: input.title });
  if (input.description !== task.description)
    changes.push({ action: "EDICAO", field: "Descrição", oldValue: task.description, newValue: input.description });
  if (input.requesterEmail !== task.requesterEmail)
    changes.push({ action: "EDICAO", field: "Solicitante", oldValue: task.requesterEmail ?? "—", newValue: input.requesterEmail });
  // Compara em minutos: o formulário não tem segundos.
  if (Math.floor(input.createdAt.getTime() / 60_000) !== Math.floor(task.createdAt.getTime() / 60_000))
    changes.push({ action: "EDICAO", field: "Data de criação", oldValue: formatDateTime(task.createdAt), newValue: formatDateTime(input.createdAt) });
  if ((input.dueAt?.getTime() ?? null) !== (task.dueAt?.getTime() ?? null))
    changes.push({ action: "EDICAO", field: "Prazo", oldValue: formatDateTime(task.dueAt), newValue: formatDateTime(input.dueAt) });
  if (input.responsibleId !== task.responsibleId) {
    const responsible = await activeUser(input.responsibleId);
    changes.push({ action: "ATRIBUICAO", field: "Responsável", oldValue: userLabel(task.responsible), newValue: userLabel(responsible) });
  }
  if (changes.length === 0) return task;

  const createdAtChanged = changes.some((c) => c.field === "Data de criação");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        dueAt: input.dueAt,
        responsibleId: input.responsibleId,
        requesterEmail: input.requesterEmail,
        ...(createdAtChanged ? { createdAt: input.createdAt } : {}),
      },
    });
    await tx.taskHistory.createMany({ data: changes.map((c) => ({ ...c, taskId: id, authorId: actor.id })) });
    return updated;
  });
}

/** Início e fim da execução informados ao concluir (vazios = valores padrão). */
export interface ExecutionPeriod {
  startedAt?: Date | null;
  completedAt?: Date | null;
}

/**
 * Período de execução gravado na conclusão. Padrão: início = quando a tarefa
 * foi iniciada (Play) e fim = agora; o usuário pode informar outros valores.
 */
function executionPeriod(task: { startedAt: Date | null }, now: Date, period?: ExecutionPeriod) {
  const completedAt = period?.completedAt ?? now;
  const startedAt = period?.startedAt ?? task.startedAt ?? completedAt;
  assertNotFuture(completedAt, "O fim");
  if (startedAt > completedAt) throw new ServiceError("O início não pode ser depois do fim");
  return { startedAt, completedAt };
}

export async function changeStatus(actor: Actor, id: number, to: TaskStatusValue, note?: string, period?: ExecutionPeriod) {
  const task = await loadEditable(actor, id);
  const from = task.status as TaskStatusValue;
  if (!canTransition(from, to, isAdmin(actor))) {
    throw new ServiceError(`Não é permitido mudar de "${STATUS_LABEL[from]}" para "${STATUS_LABEL[to]}"`);
  }
  const now = new Date();
  const text = note?.trim().slice(0, 5000);
  const execution = to === "CONCLUIDO" ? executionPeriod(task, now, period) : null;

  return prisma.$transaction(async (tx) => {
    // Só aplica se o status ainda for o lido (evita corrida entre duas abas).
    const res = await tx.task.updateMany({
      where: { id, status: from },
      data: { status: to, ...statusTimestamps(to, now, task.startedAt), ...(execution ?? {}) },
    });
    if (res.count === 0) throw new ServiceError("A tarefa foi alterada por outra pessoa. Recarregue a página.");
    await tx.taskHistory.create({
      data: { taskId: id, authorId: actor.id, action: "STATUS", field: "Status", oldValue: STATUS_LABEL[from], newValue: STATUS_LABEL[to], createdAt: now },
    });
    if (execution) {
      await tx.taskHistory.create({
        data: {
          taskId: id,
          authorId: actor.id,
          action: "EDICAO",
          field: "Execução",
          newValue: `${formatDateTime(execution.startedAt)} até ${formatDateTime(execution.completedAt)}`,
          createdAt: now,
        },
      });
    }
    if (text) {
      await tx.taskNote.create({ data: { taskId: id, authorId: actor.id, text, createdAt: now } });
    }
  });
}

/**
 * Passa a tarefa para outro usuário (botões "Atribuir" e "Encaminhar e
 * atribuir"). Com `reopen`, a tarefa volta a "Aberta" para o novo
 * responsável — é uma passagem de bastão, não uma volta no fluxo, por isso
 * não segue a regra de transições de status. Tarefas encerradas não mudam.
 */
export async function handoffTask(actor: Actor, id: number, responsibleId: string, opts: { reopen: boolean; note?: string | null }) {
  const task = await loadEditable(actor, id);
  const from = task.status as TaskStatusValue;
  if (!isOpen(from)) throw new ServiceError("Tarefa encerrada: não pode ser atribuída. Um administrador pode reabri-la no app.");
  const responsible = await activeUser(responsibleId);
  const changeResponsible = responsible.id !== task.responsibleId;
  const toStatus: TaskStatusValue = opts.reopen ? "ABERTA" : from;
  const changeStatusNow = toStatus !== from;
  const text = opts.note?.trim().slice(0, 5000);
  if (!changeResponsible && !changeStatusNow && !text) return task;

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const res = await tx.task.updateMany({
      where: { id, status: from },
      data: { responsibleId: responsible.id, status: toStatus, ...(changeStatusNow ? statusTimestamps(toStatus, now, task.startedAt) : {}) },
    });
    if (res.count === 0) throw new ServiceError("A tarefa foi alterada por outra pessoa. Recarregue.");
    if (changeResponsible) {
      await tx.taskHistory.create({
        data: { taskId: id, authorId: actor.id, action: "ATRIBUICAO", field: "Responsável", oldValue: userLabel(task.responsible), newValue: userLabel(responsible), createdAt: now },
      });
    }
    if (changeStatusNow) {
      await tx.taskHistory.create({
        data: { taskId: id, authorId: actor.id, action: "STATUS", field: "Status", oldValue: STATUS_LABEL[from], newValue: STATUS_LABEL[toStatus], createdAt: now },
      });
    }
    if (text) await tx.taskNote.create({ data: { taskId: id, authorId: actor.id, text, createdAt: now } });
  });
}

export async function addNote(actor: Actor, id: number, rawText: string) {
  const text = rawText.trim();
  if (!text) throw new ServiceError("Escreva a observação");
  if (text.length > 5000) throw new ServiceError("Observação muito longa");
  await loadEditable(actor, id);
  await prisma.$transaction([
    prisma.taskNote.create({ data: { taskId: id, authorId: actor.id, text } }),
    prisma.taskHistory.create({ data: { taskId: id, authorId: actor.id, action: "OBSERVACAO", newValue: text.slice(0, 200) } }),
    prisma.task.update({ where: { id }, data: { updatedAt: new Date() } }),
  ]);
}

/** Tarefas visíveis ao usuário que já foram criadas a partir de uma mensagem. */
export async function tasksForMessage(actor: Actor, gmailMessageId: string) {
  const tasks = await prisma.task.findMany({
    where: { email: { gmailMessageId } },
    select: { id: true, title: true, status: true, responsibleId: true, createdById: true },
    orderBy: { id: "desc" },
  });
  return tasks.filter((t) => canViewTask(actor, t));
}

/** Usuários ativos que podem receber tarefas. */
export function assignableUsers() {
  return prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } });
}
