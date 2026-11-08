"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireUser } from "@/lib/current-user";
import { getMessage, GmailNotAuthorizedError } from "@/lib/gmail";
import { addNote, changeStatus, createTask, deleteTask, handoffTask, ServiceError, updateTask } from "@/lib/task-service";
import { parseLocalDateTime, type TaskStatusValue } from "@/lib/time";
import { INITIAL_STATUSES, STATUS_ORDER } from "@/lib/status";

export interface FormState {
  error?: string;
}

function errorMessage(e: unknown): string {
  if (e instanceof ServiceError) return e.message;
  if (e instanceof ZodError) return e.issues.map((i) => i.message).join("; ");
  if (e instanceof GmailNotAuthorizedError) return "Autorize o acesso ao Gmail novamente para importar este e-mail.";
  console.error(e);
  return "Erro inesperado. Tente novamente.";
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function saveTaskAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = Number(fd.get("id")) || null;
  const dueRaw = str(fd, "dueAt");
  const dueAt = dueRaw ? parseLocalDateTime(dueRaw) : null;
  if (dueRaw && !dueAt) return { error: "Prazo inválido" };
  const createdAt = parseLocalDateTime(str(fd, "createdAt"));
  if (!createdAt) return { error: "Data da criação inválida" };

  const input = {
    title: str(fd, "title"),
    description: str(fd, "description"),
    responsibleId: str(fd, "responsibleId"),
    requesterEmail: str(fd, "requesterEmail"),
    createdAt,
    dueAt,
  };

  let taskId: number;
  try {
    if (id) {
      // Tarefa concluída (só administrador): o formulário também traz o período de execução.
      let execution;
      if (fd.has("executionStart")) {
        const startedAt = parseLocalDateTime(str(fd, "executionStart"));
        const completedAt = parseLocalDateTime(str(fd, "executionEnd"));
        if (!startedAt || !completedAt) return { error: "Informe a data-hora inicial e a final" };
        execution = { startedAt, completedAt };
      }
      taskId = (await updateTask(user, id, input, execution)).id;
    } else {
      const status = str(fd, "status") as TaskStatusValue;
      if (!INITIAL_STATUSES.includes(status)) return { error: "Status inválido" };
      const completedRaw = str(fd, "completedAt");
      const completedAt = status === "CONCLUIDO" ? parseLocalDateTime(completedRaw) : null;
      if (status === "CONCLUIDO" && !completedAt) return { error: "Data da conclusão inválida" };
      const startedRaw = status === "CONCLUIDO" ? str(fd, "startedAt") : "";
      const startedAt = startedRaw ? parseLocalDateTime(startedRaw) : null;
      if (startedRaw && !startedAt) return { error: "Data do início inválida" };

      // Os metadados do e-mail são buscados de novo no Gmail do próprio
      // usuário — não confiamos no que veio do navegador.
      const gmailId = str(fd, "gmailMessageId");
      let email;
      if (gmailId) {
        const { snippet: _snippet, ...metadata } = await getMessage(user.id, user.email, gmailId);
        email = metadata;
      }
      taskId = (await createTask(user, { ...input, status, completedAt, startedAt }, email)).id;
    }
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/", "layout");
  redirect(`/tarefas/${taskId}`);
}

export async function changeStatusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = Number(fd.get("id"));
  const to = str(fd, "status") as TaskStatusValue;
  if (!STATUS_ORDER.includes(to)) return { error: "Status inválido" };
  let period;
  if (to === "CONCLUIDO") {
    const startedAt = parseLocalDateTime(str(fd, "startedAt"));
    const completedAt = parseLocalDateTime(str(fd, "completedAt"));
    if (!startedAt) return { error: "Informe a data-hora inicial" };
    if (!completedAt) return { error: "Informe a data-hora final" };
    period = { startedAt, completedAt };
  }
  try {
    await changeStatus(user, id, to, str(fd, "note"), period);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function addNoteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await addNote(user, Number(fd.get("id")), str(fd, "text"));
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/tarefas/${Number(fd.get("id"))}`);
  return {};
}

/**
 * "Atribuir" e "Concluir etapa e atribuir": passa a tarefa para outra pessoa.
 * O tempo trabalhado por quem sai fica registrado no histórico.
 */
export async function handoffAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = Number(fd.get("id"));
  const responsibleId = str(fd, "responsibleId");
  if (!responsibleId) return { error: "Escolha a pessoa" };
  try {
    await handoffTask(user, id, responsibleId, { reopen: false, stage: str(fd, "mode") === "etapa", note: str(fd, "note") });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/", "layout");
  return {};
}

/** Exclui de vez uma tarefa concluída ou cancelada (só administrador). */
export async function deleteTaskAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await deleteTask(user, Number(fd.get("id")));
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/", "layout");
  redirect("/tarefas?status=CONCLUIDO");
}
