import type { Prisma } from "@prisma/client";
import { Actor, visibilityWhere } from "./permissions";
import { elapsedMs, OPEN_STATUSES, overdueMs, parseLocalDateTime, type TaskStatusValue, type TimedTask } from "./time";
import { STATUS_ORDER } from "./status";

// Filtros e ordenação compartilhados por painel, lista, relatório e exportação.
// Os filtros vêm da URL (?status=...&responsavel=...), então são compartilháveis.

export type SortKey = "criacao" | "prazo" | "tempo" | "status" | "atraso";

export interface TaskFilters {
  status: TaskStatusValue[];
  responsibleId?: string;
  origin?: "EMAIL" | "MANUAL";
  createdFrom?: string;
  createdTo?: string;
  dueFrom?: string;
  dueTo?: string;
  overdue: boolean;
  q?: string;
  sort: SortKey;
  dir: "asc" | "desc";
}

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export function parseFilters(sp: Params): TaskFilters {
  const statusRaw = sp.status;
  const statusList = (Array.isArray(statusRaw) ? statusRaw : statusRaw ? statusRaw.split(",") : []).filter((s): s is TaskStatusValue =>
    STATUS_ORDER.includes(s as TaskStatusValue),
  );
  const origin = first(sp.origem);
  const sort = first(sp.ordem) as SortKey | undefined;
  return {
    status: statusList,
    responsibleId: first(sp.responsavel),
    origin: origin === "EMAIL" || origin === "MANUAL" ? origin : undefined,
    createdFrom: first(sp.criadoDe),
    createdTo: first(sp.criadoAte),
    dueFrom: first(sp.prazoDe),
    dueTo: first(sp.prazoAte),
    overdue: first(sp.vencidas) === "1",
    q: first(sp.q)?.slice(0, 200),
    sort: sort && ["criacao", "prazo", "tempo", "status", "atraso"].includes(sort) ? sort : "criacao",
    dir: first(sp.dir) === "asc" ? "asc" : "desc",
  };
}

/** Recria a query string (para links de ordenação e exportação). */
export function filtersToQuery(f: TaskFilters, override: Partial<TaskFilters> = {}): string {
  const v = { ...f, ...override };
  const p = new URLSearchParams();
  if (v.status.length) p.set("status", v.status.join(","));
  if (v.responsibleId) p.set("responsavel", v.responsibleId);
  if (v.origin) p.set("origem", v.origin);
  if (v.createdFrom) p.set("criadoDe", v.createdFrom);
  if (v.createdTo) p.set("criadoAte", v.createdTo);
  if (v.dueFrom) p.set("prazoDe", v.dueFrom);
  if (v.dueTo) p.set("prazoAte", v.dueTo);
  if (v.overdue) p.set("vencidas", "1");
  if (v.q) p.set("q", v.q);
  if (v.sort !== "criacao") p.set("ordem", v.sort);
  if (v.dir !== "desc") p.set("dir", v.dir);
  return p.toString();
}

export function buildWhere(actor: Actor, f: TaskFilters, now = new Date()): Prisma.TaskWhereInput {
  const and: Prisma.TaskWhereInput[] = [visibilityWhere(actor)];
  if (f.status.length) and.push({ status: { in: f.status } });
  if (f.responsibleId) and.push({ responsibleId: f.responsibleId });
  if (f.origin) and.push({ origin: f.origin });

  const cFrom = parseLocalDateTime(f.createdFrom, false);
  const cTo = parseLocalDateTime(f.createdTo, true);
  if (cFrom || cTo) and.push({ createdAt: { ...(cFrom ? { gte: cFrom } : {}), ...(cTo ? { lte: cTo } : {}) } });

  const dFrom = parseLocalDateTime(f.dueFrom, false);
  const dTo = parseLocalDateTime(f.dueTo, true);
  if (dFrom || dTo) and.push({ dueAt: { ...(dFrom ? { gte: dFrom } : {}), ...(dTo ? { lte: dTo } : {}) } });

  if (f.overdue) and.push({ status: { in: OPEN_STATUSES }, dueAt: { lt: now } });

  if (f.q) {
    const q = f.q.trim();
    const asId = /^#?\d+$/.test(q) ? Number(q.replace("#", "")) : null;
    and.push({
      OR: [
        ...(asId !== null && asId <= 2_147_483_647 ? [{ id: asId }] : []),
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { requesterEmail: { contains: q, mode: "insensitive" } },
        { email: { is: { subject: { contains: q, mode: "insensitive" } } } },
        { email: { is: { sender: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  return { AND: and };
}

/**
 * Ordenação em memória: "tempo decorrido" e "atraso" dependem do instante
 * atual, por isso não são colunas do banco.
 */
export function sortTasks<T extends TimedTask & { id: number }>(tasks: T[], sort: SortKey, dir: "asc" | "desc", now = new Date()): T[] {
  const mult = dir === "asc" ? 1 : -1;
  const key = (t: T): number => {
    switch (sort) {
      case "prazo":
        return t.dueAt ? new Date(t.dueAt).getTime() : dir === "asc" ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER;
      case "tempo":
        return elapsedMs(t, now);
      case "atraso":
        return overdueMs(t, now);
      case "status":
        return STATUS_ORDER.indexOf(t.status);
      default:
        return new Date(t.createdAt).getTime();
    }
  };
  return [...tasks].sort((a, b) => (key(a) - key(b)) * mult || b.id - a.id);
}
