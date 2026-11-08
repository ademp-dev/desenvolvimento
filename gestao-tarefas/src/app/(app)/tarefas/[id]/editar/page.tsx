import { notFound, redirect } from "next/navigation";
import { TaskForm } from "@/components/TaskForm";
import { requireUser } from "@/lib/current-user";
import { canEditTask, isAdmin } from "@/lib/permissions";
import { assignableUsers, getTaskForUser } from "@/lib/task-service";
import { isOpen, toLocalInputValue, type TaskStatusValue } from "@/lib/time";

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const task = await getTaskForUser(user, Number(id));
  if (!task || !canEditTask(user, task)) notFound();
  // Encerradas (concluídas ou canceladas) só o administrador edita.
  if (!isOpen(task.status as TaskStatusValue) && !isAdmin(user)) redirect(`/tarefas/${task.id}`);

  const users = await assignableUsers();
  // Garante que o responsável atual apareça mesmo se tiver sido desativado.
  if (!users.some((u) => u.id === task.responsible.id)) users.push(task.responsible);

  const firstPlay = task.workSessions[0]?.startedAt ?? task.startedAt;
  const execution =
    task.status === "CONCLUIDO" && task.completedAt
      ? { start: toLocalInputValue(firstPlay ?? task.completedAt), end: toLocalInputValue(task.completedAt) }
      : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <TaskForm
        users={users}
        heading={`Editar tarefa #${task.id}`}
        cancelHref={`/tarefas/${task.id}`}
        nowLocal={toLocalInputValue(new Date())}
        initial={{
          id: task.id,
          title: task.title,
          description: task.description,
          responsibleId: task.responsibleId,
          requesterEmail: task.requesterEmail ?? "",
          createdAt: toLocalInputValue(task.createdAt),
          dueAt: toLocalInputValue(task.dueAt),
          execution,
        }}
      />
    </div>
  );
}
