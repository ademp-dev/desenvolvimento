"use client";

import { useEffect, useState } from "react";
import { elapsedMs, formatDuration, isOpen, overdueMs, type TaskStatusValue } from "@/lib/time";

interface Props {
  status: TaskStatusValue;
  createdAt: string;
  completedAt?: string | null;
  canceledAt?: string | null;
  dueAt?: string | null;
  showOverdue?: boolean;
}

/** Hook que devolve "agora" e se atualiza a cada 30 s (só para tarefas abertas). */
function useNow(active: boolean, intervalMs = 30_000) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    if (!active) return;
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

/**
 * Tempo decorrido em dias e horas, atualizado automaticamente no navegador
 * para tarefas abertas. Antes da hidratação usa o horário do servidor.
 */
export function Elapsed({ showOverdue = true, ...task }: Props) {
  const now = useNow(isOpen(task.status));
  const ref = now ?? new Date();
  const late = overdueMs(task, ref);
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="whitespace-nowrap tabular-nums" suppressHydrationWarning>
        {formatDuration(elapsedMs(task, ref))}
      </span>
      {showOverdue && late > 0 && (
        <span className="inline-block w-fit rounded bg-red-100 px-1.5 text-xs font-medium whitespace-nowrap text-red-800" suppressHydrationWarning>
          {isOpen(task.status) ? "Vencida há " : "Concluída com atraso de "}
          {formatDuration(late)}
        </span>
      )}
    </span>
  );
}

/** Situação do prazo: "vence em X" / "vencida há X". */
export function DueInfo(task: Props) {
  const now = useNow(isOpen(task.status));
  if (!task.dueAt || !isOpen(task.status)) return null;
  const ref = now ?? new Date();
  const diff = new Date(task.dueAt).getTime() - ref.getTime();
  return diff >= 0 ? (
    <span className="text-xs text-ink-3" suppressHydrationWarning>
      vence em {formatDuration(diff)}
    </span>
  ) : (
    <span className="text-xs font-medium text-[#d93025]" suppressHydrationWarning>
      vencida há {formatDuration(-diff)}
    </span>
  );
}
