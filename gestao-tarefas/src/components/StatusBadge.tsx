import { STATUS_LABEL } from "@/lib/status";
import type { TaskStatusValue } from "@/lib/time";

// Cores no estilo dos marcadores do Gmail.
const STYLES: Record<TaskStatusValue, string> = {
  CRIADO: "bg-[#c2e7ff] text-[#001d35]",
  ABERTA: "bg-[#ffe2a8] text-[#5c3c00]",
  EM_ANDAMENTO: "bg-[#d3e3fd] text-[#0842a0]",
  PAUSADA: "bg-[#fde7c8] text-[#8a4b00]",
  CONCLUIDO: "bg-[#c4eed0] text-[#0d652d]",
  CANCELADO: "bg-[#e3e3e3] text-[#5f6368] line-through",
};

export function StatusBadge({ status }: { status: TaskStatusValue }) {
  return (
    <span className={`inline-block rounded px-1.5 py-px text-xs font-medium whitespace-nowrap ${STYLES[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Solicitante: o e-mail, com o nome do colega como etiqueta quando o e-mail é de um usuário cadastrado. */
export function RequesterTag({ requester, compact = false }: { requester: { email: string; name: string | null } | null; compact?: boolean }) {
  if (!requester) return <span className="text-ink-3">—</span>;
  return (
    <span className="inline-flex flex-col gap-0.5">
      {requester.name && (
        <span className="w-fit rounded bg-indigo-50 px-1.5 text-xs font-medium whitespace-nowrap text-indigo-800 ring-1 ring-indigo-200 ring-inset" title="Usuário cadastrado">
          👤 {requester.name}
        </span>
      )}
      <span className={`break-all ${compact ? "text-xs text-ink-3" : "text-sm"}`}>{requester.email}</span>
    </span>
  );
}

export function OriginBadge({ origin }: { origin: "EMAIL" | "MANUAL" }) {
  return origin === "EMAIL" ? (
    <span className="inline-flex items-center gap-1 text-xs text-ink-3" title="Criada a partir de e-mail">
      <span className="msi" style={{ fontSize: 16 }}>mail</span> E-mail
    </span>
  ) : (
    <span className="text-xs text-ink-3">Manual</span>
  );
}

/**
 * Responsável pela tarefa, sempre em destaque. Mesmo visual da extensão e do
 * complemento do Gmail: fundo verde-claro, inicial e nome.
 */
export function ResponsibleTag({
  responsible,
  showLabel = true,
  className = "",
}: {
  responsible: { name: string; email: string };
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-center gap-1 rounded-full bg-[#e6f1ef] py-0.5 pr-2 pl-0.5 text-xs font-medium text-[#025148] ${className}`}
      title={`Responsável: ${responsible.name} <${responsible.email}>`}
    >
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#025148] text-[11px] text-white">
        {responsible.name.trim().charAt(0).toUpperCase()}
      </span>
      {showLabel && <span className="font-normal text-[#3f6b65]">Responsável:</span>}
      <span className="truncate">{responsible.name}</span>
    </span>
  );
}
