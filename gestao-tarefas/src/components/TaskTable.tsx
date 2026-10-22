import Link from "next/link";
import { filtersToQuery, type SortKey, type TaskFilters } from "@/lib/filters";
import type { TaskRow } from "@/lib/task-service";
import { formatDateTime, isOverdue, type TaskStatusValue } from "@/lib/time";
import { Elapsed } from "./Elapsed";
import { OriginBadge, RequesterTag, StatusBadge } from "./StatusBadge";

interface Props {
  tasks: TaskRow[];
  filters: TaskFilters;
  path: string;
  /** "report" acrescenta descrição, e-mail do responsável e data de encerramento. */
  variant?: "list" | "report";
}

function SortHeader({ label, k, filters, path }: { label: string; k: SortKey; filters: TaskFilters; path: string }) {
  const active = filters.sort === k;
  const dir = active && filters.dir === "desc" ? "asc" : "desc";
  return (
    <th className="th" aria-sort={active ? (filters.dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={`${path}?${filtersToQuery(filters, { sort: k, dir })}`} className="hover:text-brand">
        {label} {active ? (filters.dir === "asc" ? "▲" : "▼") : ""}
      </Link>
    </th>
  );
}

export function TaskTable({ tasks, filters, path, variant = "list" }: Props) {
  const report = variant === "report";
  if (tasks.length === 0) {
    return <div className="card text-center text-sm text-ink-3">Nenhuma tarefa encontrada com esses filtros.</div>;
  }
  const now = new Date();
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="min-w-full border-collapse">
        <thead>
          <tr>
            <th className="th">Nº</th>
            <th className="th">Tarefa</th>
            <th className="th">Solicitante</th>
            <th className="th">Responsável</th>
            <th className="th">Origem</th>
            <SortHeader label="Status" k="status" filters={filters} path={path} />
            <SortHeader label="Criada em" k="criacao" filters={filters} path={path} />
            <SortHeader label="Prazo" k="prazo" filters={filters} path={path} />
            <SortHeader label="Tempo decorrido" k="tempo" filters={filters} path={path} />
            {report && <th className="th">Concluída / cancelada em</th>}
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const late = isOverdue(t, now);
            return (
              <tr key={t.id} className={late ? "bg-red-50/60" : "hover:bg-nav-hover/50"}>
                <td className="td text-ink-3 tabular-nums">#{t.id}</td>
                <td className="td max-w-md">
                  <Link href={`/tarefas/${t.id}`} className="font-medium text-brand hover:underline">
                    {t.title}
                  </Link>
                  {report && t.description && <p className="mt-0.5 line-clamp-2 text-xs text-ink-3">{t.description}</p>}
                  {t.email && <p className="mt-0.5 truncate text-xs text-ink-3">✉ {t.email.subject}</p>}
                </td>
                <td className="td max-w-56">
                  <RequesterTag requester={t.requester} compact />
                </td>
                <td className="td whitespace-nowrap">
                  {t.responsible.name}
                  {report && <div className="text-xs text-ink-3">{t.responsible.email}</div>}
                </td>
                <td className="td">
                  <OriginBadge origin={t.origin} />
                </td>
                <td className="td">
                  <StatusBadge status={t.status as TaskStatusValue} />
                </td>
                <td className="td whitespace-nowrap tabular-nums">{formatDateTime(t.createdAt)}</td>
                <td className={`td whitespace-nowrap tabular-nums ${late ? "font-semibold text-[#d93025]" : ""}`}>{formatDateTime(t.dueAt)}</td>
                <td className="td">
                  <Elapsed
                    status={t.status as TaskStatusValue}
                    createdAt={t.createdAt.toISOString()}
                    completedAt={t.completedAt?.toISOString()}
                    canceledAt={t.canceledAt?.toISOString()}
                    dueAt={t.dueAt?.toISOString()}
                  />
                </td>
                {report && <td className="td whitespace-nowrap tabular-nums">{formatDateTime(t.completedAt ?? t.canceledAt)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
