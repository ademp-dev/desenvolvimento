import { prisma } from "./db";
import { isAdmin, type Actor } from "./permissions";
import { handoffTask, ServiceError } from "./task-service";
import { OPEN_STATUSES } from "./time";

// Gestão de usuários pelo administrador.

/** Tarefas abertas sob responsabilidade do usuário (precisam de outro responsável antes da exclusão). */
export function openTasksOf(userId: string) {
  return prisma.task.count({ where: { responsibleId: userId, status: { in: OPEN_STATUSES } } });
}

/**
 * Exclui um usuário.
 * - As tarefas abertas dele passam para `transferToId` (com o tempo
 *   trabalhado registrado, como em qualquer atribuição).
 * - Sem nenhum histórico (nunca teve tarefa, observação ou tempo), o cadastro
 *   é apagado de vez.
 * - Com histórico, o cadastro fica guardado e desativado: some da tela de
 *   usuários e de todas as listas, não entra mais no sistema, e o nome
 *   continua nas tarefas em que trabalhou (o histórico não se perde).
 */
export async function deleteUser(admin: Actor, userId: string, transferToId?: string | null) {
  if (!isAdmin(admin)) throw new ServiceError("Somente administradores podem excluir usuários");
  if (userId === admin.id) throw new ServiceError("Você não pode excluir a si mesmo");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw new ServiceError("Usuário não encontrado");

  const open = await prisma.task.findMany({ where: { responsibleId: userId, status: { in: OPEN_STATUSES } }, select: { id: true } });
  if (open.length) {
    if (!transferToId) throw new ServiceError(`Escolha para quem passar as ${open.length} tarefa(s) aberta(s) de ${user.name}`);
    if (transferToId === userId) throw new ServiceError("Escolha outra pessoa para receber as tarefas");
    for (const t of open) {
      await handoffTask(admin, t.id, transferToId, { reopen: false, note: `Tarefa transferida porque ${user.name} foi excluído(a) do sistema.` });
    }
  }

  const [tasks, created, notes, history, sessions] = await Promise.all([
    prisma.task.count({ where: { responsibleId: userId } }),
    prisma.task.count({ where: { createdById: userId } }),
    prisma.taskNote.count({ where: { authorId: userId } }),
    prisma.taskHistory.count({ where: { authorId: userId } }),
    prisma.taskWorkSession.count({ where: { userId } }),
  ]);
  if (tasks + created + notes + history + sessions === 0) {
    await prisma.user.delete({ where: { id: userId } });
    return { removed: true, transferred: open.length };
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { active: false, deletedAt: new Date() } }),
    prisma.googleToken.deleteMany({ where: { userId } }),
  ]);
  return { removed: false, transferred: open.length };
}
