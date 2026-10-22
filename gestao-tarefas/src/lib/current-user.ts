import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "./db";
import { isAdmin } from "./permissions";

/**
 * Usuário logado, sempre recarregado do banco: mudanças de papel ou
 * desativação valem na próxima requisição, sem esperar o cookie expirar.
 */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !user.active) return null;
  return user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/?erro=sem-permissao");
  return user;
}
