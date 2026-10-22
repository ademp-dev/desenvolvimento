import { prisma } from "./db";
import { Actor, isAdmin, visibilityWhere } from "./permissions";
import { buildWhere, sortTasks, type TaskFilters } from "./filters";
import { taskInclude, withRequesters } from "./task-service";

export const MAX_ROWS = 5000;

/** Tarefas visíveis ao usuário, filtradas e ordenadas. */
export async function findTasks(actor: Actor, filters: TaskFilters, now = new Date()) {
  const tasks = await prisma.task.findMany({
    where: buildWhere(actor, filters, now),
    include: taskInclude,
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
  });
  return withRequesters(sortTasks(tasks, filters.sort, filters.dir, now));
}

/** Usuários para o filtro "responsável": todos (admin) ou os que aparecem nas tarefas visíveis. */
export async function responsibleOptions(actor: Actor) {
  if (isAdmin(actor)) {
    return prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } });
  }
  const rows = await prisma.task.findMany({
    where: visibilityWhere(actor),
    distinct: ["responsibleId"],
    select: { responsible: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((r) => r.responsible).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
