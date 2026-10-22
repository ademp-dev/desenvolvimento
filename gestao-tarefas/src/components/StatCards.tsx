import Link from "next/link";
import type { Stats } from "@/lib/stats";
import { formatDuration } from "@/lib/time";
import { Icon } from "./Icon";

interface Props {
  stats: Stats;
  /** Base para os links de cada indicador (ex.: "/tarefas"). */
  linkBase?: string;
}

function Card({ label, value, icon, color, href }: { label: string; value: string | number; icon: string; color: string; href?: string }) {
  const body = (
    <div className="flex h-full flex-col gap-1 rounded-2xl bg-[#f2f6fc] p-4 transition hover:bg-nav-active">
      <div className="flex items-center gap-2 text-sm text-ink-2">
        <Icon name={icon} size={20} className={color} />
        {label}
      </div>
      <div className="text-[28px] leading-tight text-ink tabular-nums">{value}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function StatCards({ stats, linkBase }: Props) {
  const href = (q: string) => (linkBase ? `${linkBase}?${q}` : undefined);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
      <Card label="Total" value={stats.total} icon="inbox" color="text-ink-2" href={linkBase} />
      <Card label="Novas" value={stats.byStatus.CRIADO} icon="fiber_new" color="text-[#0b57d0]" href={href("status=CRIADO")} />
      <Card label="Abertas" value={stats.byStatus.ABERTA} icon="drafts" color="text-[#b06000]" href={href("status=ABERTA")} />
      <Card label="Em andamento" value={stats.byStatus.EM_ANDAMENTO} icon="pending_actions" color="text-[#1a73e8]" href={href("status=EM_ANDAMENTO")} />
      <Card label="Concluídas" value={stats.byStatus.CONCLUIDO} icon="task_alt" color="text-[#188038]" href={href("status=CONCLUIDO")} />
      <Card label="Canceladas" value={stats.byStatus.CANCELADO} icon="cancel" color="text-ink-3" href={href("status=CANCELADO")} />
      <Card label="Vencidas" value={stats.overdue} icon="alarm" color="text-[#d93025]" href={href("vencidas=1")} />
      <Card label="Tempo médio" value={stats.avgCompletionMs === null ? "—" : formatDuration(stats.avgCompletionMs)} icon="timer" color="text-[#9334e6]" />
    </div>
  );
}
