import Link from "next/link";
import { filtersToQuery, type SortKey, type TaskFilters } from "@/lib/filters";
import type { TaskRow } from "@/lib/task-service";
import { formatDateTime, formatShortDate, isOverdue, type TaskStatusValue } from "@/lib/time";
import { Avatar } from "./Brand";
import { Elapsed } from "./Elapsed";
import { Icon } from "./Icon";
import { StatusBadge } from "./StatusBadge";

interface Props {
  tasks: TaskRow[];
  filters: TaskFilters;
  path: string;
  /** Mostra a barra de ferramentas (atualizar, ordenação, contagem). */
  toolbar?: boolean;
  emptyText?: string;
}

const SORTS: { key: SortKey; label: string; dir: "asc" | "desc" }[] = [
  { key: "criacao", label: "Mais recentes", dir: "desc" },
  { key: "prazo", label: "Prazo", dir: "asc" },
  { key: "tempo", label: "Tempo decorrido", dir: "desc" },
  { key: "atraso", label: "Atraso", dir: "desc" },
  { key: "status", label: "Status", dir: "asc" },
];

/**
 * Lista no estilo da caixa de entrada do Gmail: cada linha é uma tarefa.
 * À esquerda o solicitante (como o remetente), no meio título + trecho da
 * descrição, à direita o tempo decorrido e a data. Tarefas "Novas" ficam em
 * negrito, como e-mails não lidos.
 */
export function TaskList({ tasks, filters, path, toolbar = true, emptyText = "Nenhuma tarefa por aqui." }: Props) {
  const now = new Date();
  const qs = filtersToQuery(filters);
  return (
    <div>
      {toolbar && (
        <div className="flex flex-wrap items-center gap-1 border-b border-line pb-1">
          <Link href={`${path}${qs ? `?${qs}` : ""}`} className="icon-btn" title="Atualizar" aria-label="Atualizar">
            <Icon name="refresh" />
          </Link>
          <div className="flex flex-wrap items-center gap-1">
            {SORTS.map((s) => {
              const active = filters.sort === s.key;
              const dir = active ? (filters.dir === "asc" ? "desc" : "asc") : s.dir;
              return (
                <Link
                  key={s.key}
                  href={`${path}?${filtersToQuery(filters, { sort: s.key, dir })}`}
                  className={`inline-flex items-center gap-0.5 rounded-full px-3 py-1 text-xs ${active ? "bg-nav-active font-medium text-[#001d35]" : "text-ink-2 hover:bg-nav-hover"}`}
                >
                  {s.label}
                  {active && <Icon name={filters.dir === "asc" ? "arrow_upward" : "arrow_downward"} size={14} />}
                </Link>
              );
            })}
          </div>
          <span className="ml-auto px-2 text-xs text-ink-3 tabular-nums">
            {tasks.length === 0 ? "0" : `1–${tasks.length}`} de {tasks.length}
          </span>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-ink-3">
          <Icon name="inbox" size={48} />
          <span className="text-sm">{emptyText}</span>
        </div>
      ) : (
        <ul>
          {tasks.map((t) => {
            const status = t.status as TaskStatusValue;
            const late = isOverdue(t, now);
            const unread = status === "CRIADO";
            const who = t.requester?.name ?? t.requester?.email ?? "Sem solicitante";
            return (
              <li key={t.id} className="relative border-b border-[#f1f3f4] hover:z-10 hover:shadow-[inset_1px_0_0_#dadce0,inset_-1px_0_0_#dadce0,0_1px_2px_0_rgba(60,64,67,.3),0_1px_3px_1px_rgba(60,64,67,.15)]">
                <Link
                  href={`/tarefas/${t.id}`}
                  className={`grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-0.5 px-2 py-2 md:grid-cols-[24px_200px_1fr_auto] md:py-1.5 ${unread ? "bg-white" : "bg-[#f2f6fc]/40"}`}
                >
                  <span className="hidden md:flex" title={late ? "Vencida" : undefined}>
                    {late ? (
                      <Icon name="alarm" size={20} className="text-[#d93025]" />
                    ) : t.origin === "EMAIL" ? (
                      <Icon name="mail" size={20} className="text-ink-3" />
                    ) : (
                      <Icon name="check_box_outline_blank" size={20} className="text-[#c4c7c5]" />
                    )}
                  </span>
                  <span className={`flex min-w-0 items-center gap-2 truncate text-sm ${unread ? "font-bold text-ink" : "text-ink-2"}`}>
                    <span className="md:hidden">
                      <Avatar name={t.requester?.name} email={t.requester?.email ?? "?"} size={28} />
                    </span>
                    <span className="truncate" title={t.requester?.email}>
                      {who}
                    </span>
                  </span>
                  <span className="col-span-3 row-start-2 flex min-w-0 items-center gap-2 text-sm md:col-span-1 md:row-start-1 md:col-start-3">
                    <StatusBadge status={status} />
                    <span className={`truncate ${unread ? "font-bold text-ink" : "text-ink"}`}>{t.title}</span>
                    {t.description && <span className="hidden truncate text-ink-3 lg:inline">— {t.description.replace(/\s+/g, " ")}</span>}
                  </span>
                  <span className="col-start-3 row-start-1 flex items-center gap-3 justify-self-end text-xs whitespace-nowrap md:col-start-4">
                    <span className="hidden text-ink-3 sm:inline">
                      <Elapsed
                        status={status}
                        createdAt={t.createdAt.toISOString()}
                        completedAt={t.completedAt?.toISOString()}
                        canceledAt={t.canceledAt?.toISOString()}
                        dueAt={t.dueAt?.toISOString()}
                        showOverdue={false}
                      />
                    </span>
                    <span className="hidden md:inline" title={`Responsável: ${t.responsible.name}`}>
                      <Avatar name={t.responsible.name} email={t.responsible.email} size={22} />
                    </span>
                    <span className={`w-16 text-right tabular-nums ${unread ? "font-bold text-ink" : "text-ink-2"}`} title={formatDateTime(t.createdAt)}>
                      {formatShortDate(t.createdAt, now)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {qs && toolbar && (
        <p className="pt-3 text-xs text-ink-3">
          Filtros aplicados.{" "}
          <Link href={path} className="text-brand hover:underline">
            Limpar
          </Link>
        </p>
      )}
    </div>
  );
}
