import { isOpen, type TaskStatusValue } from "./time";

// Os códigos internos (CRIADO, CONCLUIDO...) ficam estáveis no banco; o que o
// usuário vê são os rótulos abaixo.
export const STATUS_LABEL: Record<TaskStatusValue, string> = {
  CRIADO: "Nova",
  ABERTA: "Aberta",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDO: "Concluída",
  CANCELADO: "Cancelada",
};

/** Ordem do fluxo: Nova → Aberta → Em andamento → Concluída (Cancelada a qualquer momento). */
export const STATUS_ORDER: TaskStatusValue[] = ["CRIADO", "ABERTA", "EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"];

/** Status que podem ser escolhidos ao cadastrar uma tarefa. */
export const INITIAL_STATUSES: TaskStatusValue[] = ["CRIADO", "ABERTA", "EM_ANDAMENTO", "CONCLUIDO"];

export const ORIGIN_LABEL: Record<"EMAIL" | "MANUAL", string> = { EMAIL: "E-mail", MANUAL: "Manual" };

const FLOW: TaskStatusValue[] = ["CRIADO", "ABERTA", "EM_ANDAMENTO", "CONCLUIDO"];

/**
 * Transições permitidas.
 * - Usuário: só avança no fluxo (pode pular etapas) e pode cancelar uma
 *   tarefa aberta a qualquer momento. Concluída e Cancelada são finais.
 * - Administrador: pode mover para qualquer outro status (voltar etapas e
 *   reabrir tarefas encerradas).
 */
export function allowedTransitions(from: TaskStatusValue, isAdmin: boolean): TaskStatusValue[] {
  if (isAdmin) return STATUS_ORDER.filter((s) => s !== from);
  if (!isOpen(from)) return [];
  const ahead = FLOW.slice(FLOW.indexOf(from) + 1);
  return [...ahead, "CANCELADO"];
}

export function canTransition(from: TaskStatusValue, to: TaskStatusValue, isAdmin: boolean): boolean {
  return allowedTransitions(from, isAdmin).includes(to);
}

/** Mudança "para trás" no fluxo ou reabertura de tarefa encerrada. */
export function isBackward(from: TaskStatusValue, to: TaskStatusValue): boolean {
  if (to === "CANCELADO") return false;
  if (from === "CANCELADO") return true;
  return FLOW.indexOf(to) < FLOW.indexOf(from);
}

/** Campos de data que mudam junto com o status. */
export function statusTimestamps(to: TaskStatusValue, now: Date, startedAt: Date | null) {
  const data: { startedAt?: Date; completedAt?: Date | null; canceledAt?: Date | null } = {};
  if (isOpen(to)) {
    // Voltando para um status aberto: limpa as datas de encerramento.
    data.completedAt = null;
    data.canceledAt = null;
  }
  if ((to === "EM_ANDAMENTO" || to === "CONCLUIDO") && !startedAt) data.startedAt = now;
  if (to === "CONCLUIDO") {
    data.completedAt = now;
    data.canceledAt = null;
  }
  if (to === "CANCELADO") {
    data.canceledAt = now;
    data.completedAt = null;
  }
  return data;
}
