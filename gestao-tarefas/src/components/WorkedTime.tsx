"use client";

import { useEffect, useState } from "react";
import { formatWorked } from "@/lib/time";

interface Props {
  /** Soma dos períodos já encerrados (ms). */
  closedMs: number;
  /** Início do período em andamento (ISO), se o relógio estiver correndo. */
  runningSince?: string | null;
}

function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/**
 * Tempo efetivamente trabalhado. Com a tarefa em andamento, mostra um
 * cronômetro que corre em tempo real; pausada ou encerrada, mostra o total.
 */
export function WorkedTime({ closedMs, runningSince }: Props) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (!runningSince) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [runningSince]);

  if (!runningSince) return <span className="tabular-nums">{formatWorked(closedMs)}</span>;
  const total = closedMs + Math.max(0, (now ?? Date.parse(runningSince)) - Date.parse(runningSince));
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums" suppressHydrationWarning>
      <span className="h-2 w-2 animate-pulse rounded-full bg-[#188038]" aria-hidden="true" />
      {clock(total)}
    </span>
  );
}
