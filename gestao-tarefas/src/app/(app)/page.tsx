import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { FilterBar } from "@/components/FilterBar";
import { StatCards } from "@/components/StatCards";
import { TaskList } from "@/components/TaskList";
import { requireUser } from "@/lib/current-user";
import { filtersToQuery, parseFilters } from "@/lib/filters";
import { isAdmin } from "@/lib/permissions";
import { findTasks, responsibleOptions } from "@/lib/queries";
import { computeStats } from "@/lib/stats";
import { isOpen, type TaskStatusValue } from "@/lib/time";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const now = new Date();
  const [tasks, users] = await Promise.all([findTasks(user, filters, now), responsibleOptions(user)]);
  const stats = computeStats(tasks, now);
  const query = filtersToQuery(filters);

  // Destaques: abertas com prazo, das mais atrasadas/próximas para as mais distantes.
  const upcoming = tasks
    .filter((t) => isOpen(t.status as TaskStatusValue) && t.dueAt)
    .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime())
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={60} />
      {sp.erro === "sem-permissao" && (
        <p className="rounded-xl bg-[#fef7e0] p-3 text-sm text-[#7a5900]">Você não tem permissão para acessar aquela página.</p>
      )}
      <div>
        <h1 className="text-[22px] text-ink">Olá, {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-ink-3">
          {isAdmin(user) ? "Visão de todas as tarefas da ADEMP." : "Tarefas sob sua responsabilidade ou criadas por você."}
        </p>
      </div>

      <StatCards stats={stats} linkBase="/tarefas" />

      <details open={!!query} className="group rounded-2xl border border-line">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm text-ink-2 select-none group-open:border-b group-open:border-line">
          <span className="msi">tune</span> Filtrar indicadores
          <span className="msi ml-auto transition group-open:rotate-180">expand_more</span>
        </summary>
        <FilterBar path="/" filters={filters} users={users} showSearch={false} />
      </details>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-base font-medium text-ink">
          <span className="msi text-[#d93025]">alarm</span> Próximos prazos e vencidas
        </h2>
        <TaskList tasks={upcoming} filters={{ ...filters, sort: "prazo", dir: "asc" }} path="/tarefas" toolbar={false} emptyText="Nenhuma tarefa aberta com prazo." />
      </section>

      <Link className="btn-text" href={`/tarefas${query ? `?${query}` : ""}`}>
        Ver todas as {stats.total} tarefas <span className="msi">arrow_forward</span>
      </Link>
    </div>
  );
}
