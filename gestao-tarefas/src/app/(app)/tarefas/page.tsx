import { AutoRefresh } from "@/components/AutoRefresh";
import { FilterBar } from "@/components/FilterBar";
import { TaskList } from "@/components/TaskList";
import { requireUser } from "@/lib/current-user";
import { filtersToQuery, parseFilters } from "@/lib/filters";
import { findTasks, MAX_ROWS, responsibleOptions } from "@/lib/queries";
import { STATUS_LABEL } from "@/lib/status";

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const [tasks, users] = await Promise.all([findTasks(user, filters), responsibleOptions(user)]);

  const title = filters.overdue
    ? "Vencidas"
    : filters.status.length === 1
      ? STATUS_LABEL[filters.status[0]]
      : filters.q
        ? `Resultados para “${filters.q}”`
        : "Todas as tarefas";
  // Abre as opções de pesquisa quando pedido (ícone ajustes) ou quando há filtros além do menu lateral.
  const extra = filtersToQuery({ ...filters, status: [], overdue: false, q: undefined, sort: "criacao", dir: "desc" });
  const showFilters = sp.filtros === "1" || extra !== "" || filters.status.length > 1;

  return (
    <div className="space-y-3">
      <AutoRefresh seconds={60} />
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] text-ink">{title}</h1>
      </div>
      <details open={showFilters} className="group rounded-2xl border border-line">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm text-ink-2 select-none hover:bg-nav-hover/50 group-open:border-b group-open:border-line">
          <span className="msi">tune</span> Opções de pesquisa
          <span className="msi ml-auto transition group-open:rotate-180">expand_more</span>
        </summary>
        <FilterBar path="/tarefas" filters={filters} users={users} />
      </details>
      <TaskList tasks={tasks} filters={filters} path="/tarefas" />
      {tasks.length >= MAX_ROWS && <p className="text-xs text-ink-3">Exibindo as {MAX_ROWS} mais recentes; refine os filtros.</p>}
    </div>
  );
}
