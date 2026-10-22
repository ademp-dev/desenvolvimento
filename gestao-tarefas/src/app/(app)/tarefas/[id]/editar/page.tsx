import { notFound, redirect } from "next/navigation";
import { TaskForm } from "@/components/TaskForm";
import { requireUser } from "@/lib/current-user";
import { canEditTask } from "@/lib/permissions";
import { assignableUsers, getTaskForUser } from "@/lib/task-service";
import { isOpen, toLocalInputValue, type TaskStatusValue } from "@/lib/time";

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const task = await getTaskForUser(user, Number(id));
  if (!task || !canEditTask(user, task)) notFound();
  if (!isOpen(task.status as TaskStatusValue)) redirect(`/tarefas/${task.id}`);

  const users = await assignableUsers();
  // Garante que o responsável atual apareça mesmo se tiver sido desativado.
  if (!users.some((u) => u.id === task.responsible.id)) users.push(task.responsible);

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
        }}
      />
    </div>
  );
}
