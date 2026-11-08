import { AutoRefresh } from "@/components/AutoRefresh";
import { FilterBar } from "@/components/FilterBar";
import { StatCards } from "@/components/StatCards";
import { TaskTable } from "@/components/TaskTable";
import { requireAdmin } from "@/lib/current-user";
import { filtersToQuery, parseFilters } from "@/lib/filters";
import { findTasks, MAX_ROWS, responsibleOptions } from "@/lib/queries";
import { computeStats, statsByUser } from "@/lib/stats";
import { hasGmailSendAccess } from "@/lib/gmail";
import { formatDateTime, formatDuration, formatWorked } from "@/lib/time";
import { SendReportForm } from "./SendReportForm";

export default async function ReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const now = new Date();
  const [tasks, users, canSend] = await Promise.all([findTasks(admin, filters, now), responsibleOptions(admin), hasGmailSendAccess(admin.id)]);
  const stats = computeStats(tasks, now);
  const perUser = statsByUser(tasks, now);
  const qs = filtersToQuery(filters);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={120} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[22px] text-ink">Relatório geral</h1>
          <p className="text-sm text-ink-3">
            Tarefas de todos os usuários · {tasks.length} resultado(s){tasks.length >= MAX_ROWS && ` (limitado a ${MAX_ROWS})`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-secondary" href={`/api/relatorios/exportar?formato=pdf${qs ? `&${qs}` : ""}`} target="_blank" rel="noopener">
            ⬇ PDF
          </a>
          <a className="btn-secondary" href={`/api/relatorios/exportar?formato=xlsx${qs ? `&${qs}` : ""}`}>
            ⬇ Excel
          </a>
          <a className="btn-secondary" href={`/api/relatorios/exportar?formato=csv${qs ? `&${qs}` : ""}`}>
            ⬇ CSV
          </a>
          <SendReportForm qs={qs} canSend={canSend} defaultSubject={`Relatório geral de tarefas — ${formatDateTime(now)}`} startOpen={sp.enviar === "1"} />
        </div>
      </div>

      <FilterBar path="/relatorios" filters={filters} users={users} />
      <StatCards stats={stats} />

      <section className="space-y-2">
        <h2 className="text-base font-medium text-ink">Indicadores por usuário</h2>
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="min-w-full border-collapse">
            <thead>
              <tr>
                <th className="th">Responsável</th>
                <th className="th text-right">Total</th>
                <th className="th text-right">Novas</th>
                <th className="th text-right">Abertas</th>
                <th className="th text-right">Em andamento</th>
                <th className="th text-right">Pausadas</th>
                <th className="th text-right">Concluídas</th>
                <th className="th text-right">Canceladas</th>
                <th className="th text-right">Vencidas</th>
                <th className="th text-right">Concluídas c/ atraso</th>
                <th className="th">Tempo médio de conclusão</th>
                <th className="th">Tempo trabalhado</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {perUser.map((u) => (
                <tr key={u.userId} className="hover:bg-nav-hover/50">
                  <td className="td">
                    {u.name}
                    <div className="text-xs text-ink-3">{u.email}</div>
                  </td>
                  <td className="td text-right font-semibold">{u.total}</td>
                  <td className="td text-right">{u.byStatus.CRIADO}</td>
                  <td className="td text-right">{u.byStatus.ABERTA}</td>
                  <td className="td text-right">{u.byStatus.EM_ANDAMENTO}</td>
                  <td className="td text-right">{u.byStatus.PAUSADA}</td>
                  <td className="td text-right">{u.byStatus.CONCLUIDO}</td>
                  <td className="td text-right">{u.byStatus.CANCELADO}</td>
                  <td className={`td text-right ${u.overdue ? "font-semibold text-[#d93025]" : ""}`}>{u.overdue}</td>
                  <td className="td text-right">{u.completedLate}</td>
                  <td className="td">{u.avgCompletionMs === null ? "—" : formatDuration(u.avgCompletionMs)}</td>
                  <td className="td font-medium">{formatWorked(u.workedMs)}</td>
                </tr>
              ))}
              {perUser.length === 0 && (
                <tr>
                  <td className="td text-center text-ink-3" colSpan={12}>
                    Sem dados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-medium text-ink">Tarefas</h2>
        <TaskTable tasks={tasks} filters={filters} path="/relatorios" variant="report" />
      </section>
    </div>
  );
}
