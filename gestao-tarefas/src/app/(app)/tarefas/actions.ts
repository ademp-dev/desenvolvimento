"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireUser } from "@/lib/current-user";
import { getMessage, GmailNotAuthorizedError } from "@/lib/gmail";
import { addNote, changeStatus, createTask, ServiceError, updateTask } from "@/lib/task-service";
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
      taskId = (await updateTask(user, id, input)).id;
    } else {
      const status = str(fd, "status") as TaskStatusValue;
      if (!INITIAL_STATUSES.includes(status)) return { error: "Status inválido" };
      const completedRaw = str(fd, "completedAt");
      const completedAt = status === "CONCLUIDO" ? parseLocalDateTime(completedRaw) : null;
      if (status === "CONCLUIDO" && !completedAt) return { error: "Data da conclusão inválida" };

      // Os metadados do e-mail são buscados de novo no Gmail do próprio
      // usuário — não confiamos no que veio do navegador.
      const gmailId = str(fd, "gmailMessageId");
      let email;
      if (gmailId) {
        const { snippet: _snippet, ...metadata } = await getMessage(user.id, user.email, gmailId);
        email = metadata;
      }
      taskId = (await createTask(user, { ...input, status, completedAt }, email)).id;
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
  try {
    await changeStatus(user, id, to, str(fd, "note"));
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
