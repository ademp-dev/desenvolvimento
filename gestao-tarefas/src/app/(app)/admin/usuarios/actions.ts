"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { allowedDomain } from "@/lib/config";
import { requireAdmin } from "@/lib/current-user";
import { prisma } from "@/lib/db";

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
  if (await prisma.user.findUnique({ where: { email } })) return { error: "Usuário já cadastrado" };
  await prisma.user.create({ data: { email, name } });
  revalidatePath("/admin/usuarios");
  return { ok: `${name} cadastrado.` };
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
