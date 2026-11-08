import { prisma } from "./db";
import { describeFilters, type TaskFilters } from "./filters";
import type { Actor } from "./permissions";
import { findTasks } from "./queries";
import { reportPdf } from "./report-pdf";
import { computeStats, statsByUser } from "./stats";

/** Monta o PDF do relatório geral com os filtros informados (download e envio por e-mail). */
export async function buildReportPdf(actor: Actor & { name: string }, filters: TaskFilters, now = new Date()) {
  const tasks = await findTasks(actor, filters, now);
  const responsible = filters.responsibleId
    ? await prisma.user.findUnique({ where: { id: filters.responsibleId }, select: { name: true } })
    : null;
  const pdf = await reportPdf({
    tasks,
    stats: computeStats(tasks, now),
    perUser: statsByUser(tasks, now),
    filters: describeFilters(filters, responsible?.name),
    generatedBy: actor.name,
    now,
  });
  const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(now); // AAAA-MM-DD
  return { pdf, filename: `relatorio-tarefas-${stamp}.pdf`, count: tasks.length };
}
