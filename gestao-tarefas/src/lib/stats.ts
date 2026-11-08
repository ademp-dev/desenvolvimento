import { elapsedMs, isOverdue, overdueMs, periodMs, workedMs, type TaskStatusValue, type TimedTask, type WorkPeriod } from "./time";

// Indicadores consolidados (painel e relatório).

export interface Stats {
  total: number;
  byStatus: Record<TaskStatusValue, number>;
  overdue: number;
  completedLate: number;
  avgCompletionMs: number | null;
  /** Soma do tempo efetivamente trabalhado (Play → Pause) nas tarefas. */
  workedMs: number;
}

type WithPeriods = TimedTask & { workSessions?: WorkPeriod[] };

export function computeStats(tasks: WithPeriods[], now = new Date()): Stats {
  const byStatus: Record<TaskStatusValue, number> = { CRIADO: 0, ABERTA: 0, EM_ANDAMENTO: 0, PAUSADA: 0, CONCLUIDO: 0, CANCELADO: 0 };
  let overdue = 0;
  let completedLate = 0;
  let completedSum = 0;
  let worked = 0;
  for (const t of tasks) {
    byStatus[t.status]++;
    if (isOverdue(t, now)) overdue++;
    if (t.status === "CONCLUIDO") {
      completedSum += elapsedMs(t, now);
      if (overdueMs(t, now) > 0) completedLate++;
    }
    worked += workedMs(t.workSessions ?? [], now);
  }
  return {
    total: tasks.length,
    byStatus,
    overdue,
    completedLate,
    avgCompletionMs: byStatus.CONCLUIDO ? completedSum / byStatus.CONCLUIDO : null,
    workedMs: worked,
  };
}

export interface UserStats extends Stats {
  userId: string;
  name: string;
  email: string;
}

interface Person {
  id: string;
  name: string;
  email: string;
}

/**
 * Indicadores por pessoa. Contagens e prazos são do responsável atual; o
 * tempo trabalhado é de quem trabalhou (cada período é de quem estava com a
 * tarefa), então quem passou a tarefa adiante continua com o seu tempo.
 */
export function statsByUser<
  T extends TimedTask & { responsible: Person; workSessions?: (WorkPeriod & { user?: { name: string; email: string } })[] },
>(tasks: T[], now = new Date()): UserStats[] {
  const groups = new Map<string, { person: Person; tasks: T[]; worked: number }>();
  const group = (p: Person) => {
    let g = groups.get(p.id);
    if (!g) groups.set(p.id, (g = { person: p, tasks: [], worked: 0 }));
    return g;
  };
  for (const t of tasks) {
    group(t.responsible).tasks.push(t);
    for (const s of t.workSessions ?? []) {
      const who = s.userId === t.responsible.id ? t.responsible : { id: s.userId, name: s.user?.name ?? s.userId, email: s.user?.email ?? "" };
      group(who).worked += periodMs(s, now);
    }
  }
  return [...groups.values()]
    .map(({ person, tasks: list, worked }) => ({
      userId: person.id,
      name: person.name,
      email: person.email,
      ...computeStats(list, now),
      workedMs: worked,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
