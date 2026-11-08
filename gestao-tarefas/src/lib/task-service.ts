import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { Actor, canEditTask, canViewTask, isAdmin } from "./permissions";
import { canTransition, INITIAL_STATUSES, statusTimestamps, STATUS_LABEL } from "./status";
import { formatDateTime, formatWorked, isOpen, isRunning, workedMs, type TaskStatusValue } from "./time";

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
  workSessions: {
    select: { id: true, userId: true, startedAt: true, endedAt: true, user: { select: { name: true, email: true } } },
    orderBy: { startedAt: "asc" },
  },
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
    // Cadastro já em andamento ou concluído: o período de trabalho começa no início informado.
    if (startedAt && (input.status === "EM_ANDAMENTO" || (completedAt && completedAt > startedAt))) {
      await tx.taskWorkSession.create({ data: { taskId: task.id, userId: responsible.id, startedAt, endedAt: completedAt } });
    }
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

/**
 * Edita os dados da tarefa. Encerradas (concluídas ou canceladas) só podem
 * ser editadas por administrador; nas concluídas, o administrador também
 * pode corrigir a data-hora inicial e a final (`execution`).
 */
export async function updateTask(actor: Actor, id: number, rawInput: TaskInput, execution?: ExecutionPeriod) {
  const input = taskInputSchema.parse(rawInput);
  const task = await loadEditable(actor, id);
  const closed = !isOpen(task.status as TaskStatusValue);
  if (closed && !isAdmin(actor)) {
    throw new ServiceError("Tarefas encerradas só podem ser editadas por um administrador.");
  }
  assertNotFuture(input.createdAt, "A data de criação");

  const changes: HistoryEntry[] = [];
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
  const exec = task.status === "CONCLUIDO" && execution ? correctedExecution(task, input.createdAt, execution) : null;
  if (exec) changes.push(exec.history);
  if (changes.length === 0) return task;

  const createdAtChanged = changes.some((c) => c.field === "Data de criação");
  const now = new Date();
  // Trocar o responsável de tarefa aberta é passar adiante: fecha o tempo de quem saiu.
  const passOn = !closed && input.responsibleId !== task.responsibleId ? handoffEffects(task, now) : null;
  if (passOn) changes.push(...passOn.history);
  return prisma.$transaction(async (tx) => {
    if (passOn) await closeOpenPeriod(tx, id, now);
    if (exec) await applyCorrectedExecution(tx, task, id, exec);
    const updated = await tx.task.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        dueAt: input.dueAt,
        responsibleId: input.responsibleId,
        requesterEmail: input.requesterEmail,
        ...(createdAtChanged ? { createdAt: input.createdAt } : {}),
        ...(passOn?.status ? { status: passOn.status } : {}),
        ...(exec ? { startedAt: exec.startedAt, completedAt: exec.completedAt } : {}),
      },
    });
    await tx.taskHistory.createMany({ data: changes.map((c) => ({ ...c, taskId: id, authorId: actor.id, createdAt: now })) });
    return updated;
  });
}

const sameMinute = (a: Date | null | undefined, b: Date | null | undefined) =>
  !!a && !!b && Math.floor(a.getTime() / 60_000) === Math.floor(b.getTime() / 60_000);

/**
 * Correção da data-hora inicial e final de uma tarefa concluída (só
 * administrador). O primeiro período trabalhado passa a começar no início e o
 * último a terminar no fim; sem Play registrado, o período vira um só.
 * Devolve null quando nada mudou.
 */
function correctedExecution(task: TaskWithSessions & { startedAt: Date | null; completedAt: Date | null }, createdAt: Date, e: ExecutionPeriod) {
  const startedAt = e.startedAt ?? task.startedAt;
  const completedAt = e.completedAt ?? task.completedAt;
  if (!startedAt || !completedAt) throw new ServiceError("Informe a data-hora inicial e a final");
  if (sameMinute(startedAt, task.startedAt) && sameMinute(completedAt, task.completedAt)) return null;
  assertNotFuture(completedAt, "A data-hora final");
  if (startedAt > completedAt) throw new ServiceError("O início não pode ser depois do fim");
  if (completedAt < createdAt) throw new ServiceError("A conclusão não pode ser anterior à criação");
  const sessions = task.workSessions;
  const first = sessions[0];
  const last = sessions[sessions.length - 1];
  if (sessions.length > 1 && first.endedAt && startedAt > first.endedAt) {
    throw new ServiceError(`O início não pode ser depois do primeiro Pause (${formatDateTime(first.endedAt)})`);
  }
  if (sessions.length > 1 && completedAt < last.startedAt) {
    throw new ServiceError(`O fim não pode ser antes do último Play (${formatDateTime(last.startedAt)})`);
  }
  return {
    startedAt,
    completedAt,
    history: {
      action: "EDICAO",
      field: "Execução",
      oldValue: `${formatDateTime(task.startedAt)} até ${formatDateTime(task.completedAt)}`,
      newValue: `${formatDateTime(startedAt)} até ${formatDateTime(completedAt)}`,
    } satisfies HistoryEntry,
  };
}

async function applyCorrectedExecution(tx: Tx, task: TaskWithSessions, taskId: number, exec: { startedAt: Date; completedAt: Date }) {
  const sessions = task.workSessions;
  if (sessions.length === 0) {
    await tx.taskWorkSession.create({ data: { taskId, userId: task.responsibleId, ...periodOf(exec) } });
    return;
  }
  const first = sessions[0];
  const last = sessions[sessions.length - 1];
  if (first.id === last.id) {
    await tx.taskWorkSession.update({ where: { id: first.id }, data: periodOf(exec) });
    return;
  }
  await tx.taskWorkSession.update({ where: { id: first.id }, data: { startedAt: exec.startedAt } });
  await tx.taskWorkSession.update({ where: { id: last.id }, data: { endedAt: exec.completedAt } });
}

/**
 * Exclui de vez uma tarefa encerrada (concluída ou cancelada), com
 * observações, histórico e tempo trabalhado. Só administrador.
 */
export async function deleteTask(actor: Actor, id: number) {
  if (!isAdmin(actor)) throw new ServiceError("Somente administradores podem excluir tarefas");
  const task = await loadEditable(actor, id);
  if (isOpen(task.status as TaskStatusValue)) throw new ServiceError("Só tarefas concluídas ou canceladas podem ser excluídas.");
  await prisma.task.delete({ where: { id } });
  console.log(`Tarefa #${id} ("${task.title}") excluída por ${actor.id}`);
}

// --- Períodos trabalhados -------------------------------------------------------

// Cliente dentro de uma transação (o mesmo do src/lib/db.ts, com o apelido no nome).
type Tx = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
type HistoryEntry = { action: string; field: string; oldValue: string | null; newValue: string };
type TaskWithSessions = Pick<TaskWithRelations, "status" | "responsible" | "responsibleId" | "workSessions">;

/** Fecha o período aberto (se houver) no instante informado. */
function closeOpenPeriod(tx: Tx, taskId: number, at: Date) {
  return tx.taskWorkSession.updateMany({ where: { taskId, endedAt: null }, data: { endedAt: at } });
}

/** Tempo trabalhado por uma pessoa na tarefa, contando o período aberto até `now`. */
function userWorkedMs(task: TaskWithSessions, userId: string, now: Date) {
  return workedMs(task.workSessions.filter((s) => s.userId === userId), now);
}

/**
 * O que acontece quando a tarefa passa do responsável atual para outra
 * pessoa: o período aberto fecha (o tempo fica com quem saiu), uma tarefa em
 * andamento ou pausada volta para "Aberta" (o novo responsável dá o Play) e o
 * histórico registra quanto tempo o antecessor trabalhou.
 */
function handoffEffects(task: TaskWithSessions, now: Date, stage = false) {
  const from = task.status as TaskStatusValue;
  const status: TaskStatusValue | null = stage || from === "EM_ANDAMENTO" || from === "PAUSADA" ? "ABERTA" : null;
  const spent = userWorkedMs(task, task.responsibleId, now);
  const history: HistoryEntry[] = [];
  if (stage || spent > 0) {
    history.push({
      action: stage ? "ETAPA" : "ATRIBUICAO",
      field: stage ? "Etapa concluída" : "Tempo trabalhado",
      oldValue: null,
      newValue: `${task.responsible.name} trabalhou ${formatWorked(spent)}`,
    });
  }
  if (status && status !== from) {
    history.push({ action: "STATUS", field: "Status", oldValue: STATUS_LABEL[from], newValue: STATUS_LABEL[status] });
  }
  return { status: status !== from ? status : null, history };
}

/** Início e fim da execução informados ao concluir (vazios = valores padrão). */
export interface ExecutionPeriod {
  startedAt?: Date | null;
  completedAt?: Date | null;
}

/**
 * Período de execução gravado na conclusão. Padrão: início = primeiro Play
 * e fim = agora; o usuário pode informar outros valores. Os períodos
 * trabalhados são ajustados a esses limites: o primeiro começa no início
 * informado e o último (aberto, ou terminado depois do fim) termina no fim.
 */
function executionPeriod(task: TaskWithSessions & { startedAt: Date | null }, now: Date, period?: ExecutionPeriod) {
  const completedAt = period?.completedAt ?? now;
  assertNotFuture(completedAt, "O fim");
  const sessions = task.workSessions;
  const first = sessions[0];
  const last = sessions[sessions.length - 1];
  if (last && completedAt < last.startedAt) {
    throw new ServiceError(`O fim não pode ser antes do último Play (${formatDateTime(last.startedAt)})`);
  }
  const startedAt = period?.startedAt ?? first?.startedAt ?? task.startedAt ?? completedAt;
  if (startedAt > completedAt) throw new ServiceError("O início não pode ser depois do fim");
  if (first && first.endedAt && startedAt > first.endedAt) {
    throw new ServiceError(`O início não pode ser depois do primeiro Pause (${formatDateTime(first.endedAt)})`);
  }
  return { startedAt, completedAt };
}

/** Aplica o período de execução aos períodos trabalhados (ver executionPeriod). */
async function settlePeriods(tx: Tx, task: TaskWithSessions & { id: number }, exec: { startedAt: Date; completedAt: Date }) {
  const sessions = task.workSessions;
  if (sessions.length === 0) {
    // Concluída sem Play: o período informado vira o tempo trabalhado do responsável.
    if (exec.completedAt > exec.startedAt) {
      await tx.taskWorkSession.create({ data: { taskId: task.id, userId: task.responsibleId, ...periodOf(exec) } });
    }
    return;
  }
  const first = sessions[0];
  if (first.startedAt.getTime() !== exec.startedAt.getTime()) {
    await tx.taskWorkSession.update({ where: { id: first.id }, data: { startedAt: exec.startedAt } });
  }
  for (const s of sessions) {
    if (!s.endedAt || s.endedAt > exec.completedAt) {
      await tx.taskWorkSession.update({ where: { id: s.id }, data: { endedAt: exec.completedAt } });
    }
  }
}

const periodOf = (exec: { startedAt: Date; completedAt: Date }) => ({ startedAt: exec.startedAt, endedAt: exec.completedAt });

export async function changeStatus(actor: Actor, id: number, to: TaskStatusValue, note?: string, period?: ExecutionPeriod) {
  const task = await loadEditable(actor, id);
  const from = task.status as TaskStatusValue;
  if (!canTransition(from, to, isAdmin(actor))) {
    throw new ServiceError(`Não é permitido mudar de "${STATUS_LABEL[from]}" para "${STATUS_LABEL[to]}"`);
  }
  const now = new Date();
  const text = note?.trim().slice(0, 5000);
  const execution = to === "CONCLUIDO" ? executionPeriod(task, now, period) : null;
  const running = isRunning(task.workSessions);

  return prisma.$transaction(async (tx) => {
    // Só aplica se o status ainda for o lido (evita corrida entre duas abas).
    const res = await tx.task.updateMany({
      where: { id, status: from },
      data: { status: to, ...statusTimestamps(to, now, task.startedAt), ...(execution ?? {}) },
    });
    if (res.count === 0) throw new ServiceError("A tarefa foi alterada por outra pessoa. Recarregue a página.");

    // Relógio do tempo trabalhado: Play abre um período; qualquer outra mudança fecha.
    if (to === "EM_ANDAMENTO") {
      if (!running) await tx.taskWorkSession.create({ data: { taskId: id, userId: task.responsibleId, startedAt: now } });
    } else if (execution) {
      await settlePeriods(tx, task, execution);
    } else if (running) {
      await closeOpenPeriod(tx, id, now);
    }

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

export interface HandoffOptions {
  /** "Encaminhar e atribuir": a tarefa fica "Aberta" para o novo responsável. */
  reopen: boolean;
  /** "Concluir etapa e atribuir": registra a etapa de quem sai e deixa a tarefa "Aberta". */
  stage?: boolean;
  note?: string | null;
}

/**
 * Passa a tarefa para outro usuário (botões "Atribuir", "Concluir etapa e
 * atribuir" e "Encaminhar e atribuir"). O tempo trabalhado até aqui fica com
 * quem sai (o período aberto fecha agora) e o histórico registra quanto foi.
 * Com `reopen`/`stage`, ou se estava em andamento/pausada, a tarefa volta a
 * "Aberta" para o novo responsável — é uma passagem de bastão, não uma volta
 * no fluxo, por isso não segue a regra de transições. Encerradas não mudam.
 */
export async function handoffTask(actor: Actor, id: number, responsibleId: string, opts: HandoffOptions) {
  const task = await loadEditable(actor, id);
  const from = task.status as TaskStatusValue;
  if (!isOpen(from)) throw new ServiceError("Tarefa encerrada: não pode ser atribuída. Um administrador pode reabri-la no app.");
  const responsible = await activeUser(responsibleId);
  const changeResponsible = responsible.id !== task.responsibleId;
  if (opts.stage && !changeResponsible) throw new ServiceError("Escolha outra pessoa para continuar a tarefa.");
  const text = opts.note?.trim().slice(0, 5000);
  const now = new Date();

  const effects = changeResponsible ? handoffEffects(task, now, opts.stage) : { status: null, history: [] };
  const toStatus: TaskStatusValue = opts.reopen && from !== "ABERTA" ? "ABERTA" : (effects.status ?? from);
  const changeStatusNow = toStatus !== from;
  if (!changeResponsible && !changeStatusNow && !text) return task;
  const history = effects.history.filter((h) => h.action !== "STATUS");
  if (changeStatusNow) history.push({ action: "STATUS", field: "Status", oldValue: STATUS_LABEL[from], newValue: STATUS_LABEL[toStatus] });

  return prisma.$transaction(async (tx) => {
    const res = await tx.task.updateMany({
      where: { id, status: from },
      data: { responsibleId: responsible.id, status: toStatus, ...(changeStatusNow ? statusTimestamps(toStatus, now, task.startedAt) : {}) },
    });
    if (res.count === 0) throw new ServiceError("A tarefa foi alterada por outra pessoa. Recarregue.");
    if (changeResponsible || changeStatusNow) await closeOpenPeriod(tx, id, now);
    if (changeResponsible) {
      history.unshift({ action: "ATRIBUICAO", field: "Responsável", oldValue: userLabel(task.responsible), newValue: userLabel(responsible) });
    }
    await tx.taskHistory.createMany({ data: history.map((h) => ({ ...h, taskId: id, authorId: actor.id, createdAt: now })) });
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
