// Regras de acesso. Toda rota/ação do servidor passa por aqui — a interface
// apenas esconde botões, nunca é a única barreira.

export interface Actor {
  id: string;
  role: "USER" | "ADMIN";
  active: boolean;
}

export interface TaskOwnership {
  responsibleId: string;
  createdById: string;
}

export const isAdmin = (u: Actor) => u.active && u.role === "ADMIN";

/** Pode ver: administrador, responsável ou quem criou a tarefa. */
export function canViewTask(u: Actor, t: TaskOwnership): boolean {
  if (!u.active) return false;
  return isAdmin(u) || t.responsibleId === u.id || t.createdById === u.id;
}

/** Pode editar, mudar status e comentar: as mesmas pessoas que podem ver. */
export function canEditTask(u: Actor, t: TaskOwnership): boolean {
  return canViewTask(u, t);
}

/** Relatório geral consolidado e gestão de usuários: somente administradores. */
export function canViewGeneralReport(u: Actor): boolean {
  return isAdmin(u);
}

/** Filtro Prisma de visibilidade para listagens. */
export function visibilityWhere(u: Actor) {
  if (isAdmin(u)) return {};
  return { OR: [{ responsibleId: u.id }, { createdById: u.id }] };
}
