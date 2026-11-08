"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { allowedDomain } from "@/lib/config";
import { requireAdmin } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/task-service";
import { deleteUser } from "@/lib/user-service";

export interface AdminFormState {
  error?: string;
  ok?: string;
}

/** Pré-cadastra um usuário para que já possa receber tarefas antes do 1º login. */
export async function addUserAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  await requireAdmin();
  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email("E-mail inválido"), name: z.string().trim().min(2, "Informe o nome").max(120) })
    .safeParse({ email: fd.get("email"), name: fd.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, name } = parsed.data;
  const domain = allowedDomain();
  if (domain && !email.endsWith(`@${domain}`)) return { error: `Somente contas @${domain}` };
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && !existing.deletedAt) return { error: "Usuário já cadastrado" };
  if (existing) {
    // Tinha sido excluído: volta com o histórico antigo.
    await prisma.user.update({ where: { id: existing.id }, data: { name, active: true, deletedAt: null } });
  } else {
    await prisma.user.create({ data: { email, name } });
  }
  revalidatePath("/admin/usuarios");
  return { ok: `${name} cadastrado.` };
}

/** Exclui o usuário; as tarefas abertas dele vão para quem o administrador escolher. */
export async function deleteUserAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const transferTo = String(fd.get("transferTo") ?? "") || null;
  try {
    const res = await deleteUser(admin, id, transferTo);
    revalidatePath("/", "layout");
    return { ok: res.transferred ? `Usuário excluído. ${res.transferred} tarefa(s) transferida(s).` : "Usuário excluído." };
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    console.error(e);
    return { error: "Não foi possível excluir. Tente novamente." };
  }
}

export async function updateUserAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = String(fd.get("id"));
  const op = String(fd.get("op"));
  if (id === admin.id) return; // não pode rebaixar nem desativar a si mesmo
  const data =
    op === "make-admin" ? { role: "ADMIN" as const }
    : op === "make-user" ? { role: "USER" as const }
    : op === "deactivate" ? { active: false }
    : op === "activate" ? { active: true }
    : null;
  if (!data) return;
  await prisma.user.update({ where: { id }, data });
  revalidatePath("/admin/usuarios");
}

/**
 * Apelido: nome curto exibido como responsável em todo o sistema (web,
 * extensão e complemento). Vazio = volta a usar o nome completo.
 */
export async function setNicknameAction(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id"));
  const nickname = String(fd.get("nickname") ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  await prisma.user.update({ where: { id }, data: { nickname: nickname || null } });
  revalidatePath("/", "layout");
}
