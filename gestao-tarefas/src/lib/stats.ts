import { elapsedMs, isOverdue, overdueMs, type TaskStatusValue, type TimedTask } from "./time";

// Indicadores consolidados (painel e relatório).

export interface Stats {
  total: number;
  byStatus: Record<TaskStatusValue, number>;
  overdue: number;
  completedLate: number;
  avgCompletionMs: number | null;
}

export function computeStats(tasks: TimedTask[], now = new Date()): Stats {
  const byStatus: Record<TaskStatusValue, number> = { CRIADO: 0, ABERTA: 0, EM_ANDAMENTO: 0, CONCLUIDO: 0, CANCELADO: 0 };
  let overdue = 0;
  let completedLate = 0;
  let completedSum = 0;
  for (const t of tasks) {
    byStatus[t.status]++;
    if (isOverdue(t, now)) overdue++;
    if (t.status === "CONCLUIDO") {
      completedSum += elapsedMs(t, now);
      if (overdueMs(t, now) > 0) completedLate++;
    }
  }
  return {
    total: tasks.length,
    byStatus,
    overdue,
    completedLate,
    avgCompletionMs: byStatus.CONCLUIDO ? completedSum / byStatus.CONCLUIDO : null,
  };
}

export interface UserStats extends Stats {
  userId: string;
  name: string;
  email: string;
}

export function statsByUser<T extends TimedTask & { responsible: { id: string; name: string; email: string } }>(
  tasks: T[],
  now = new Date(),
): UserStats[] {
  const groups = new Map<string, T[]>();
  for (const t of tasks) {
    const list = groups.get(t.responsible.id) ?? [];
    list.push(t);
    groups.set(t.responsible.id, list);
  }
  return [...groups.values()]
    .map((list) => ({
      userId: list[0].responsible.id,
      name: list[0].responsible.name,
      email: list[0].responsible.email,
      ...computeStats(list, now),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
