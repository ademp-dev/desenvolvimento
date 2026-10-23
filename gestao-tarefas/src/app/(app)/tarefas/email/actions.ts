"use server";

import { revalidatePath } from "next/cache";
import { signIn } from "@/auth";
import { allowedDomain, GMAIL_READONLY_SCOPE } from "@/lib/config";
import { decrypt } from "@/lib/crypto";
import { requireUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

/**
 * Autorização incremental: pede ao Google somente a permissão de LEITURA do
 * Gmail, e só para quem usa este recurso. access_type=offline devolve um
 * refresh token para que a autorização não expire a cada hora.
 */
export async function authorizeGmailAction() {
  const user = await requireUser();
  await signIn(
    "google",
    { redirectTo: "/tarefas/email" },
    {
      scope: `openid email profile ${GMAIL_READONLY_SCOPE}`,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      login_hint: user.email,
      hd: allowedDomain(),
    },
  );
}

/** Desconecta o Gmail: revoga o token no Google e apaga a cópia local. */
export async function disconnectGmailAction() {
  const user = await requireUser();
  const t = await prisma.googleToken.findUnique({ where: { userId: user.id } });
  if (t) {
    const token = t.refreshToken ? decrypt(t.refreshToken) : decrypt(t.accessToken);
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    }).catch(() => {});
    await prisma.googleToken.delete({ where: { userId: user.id } });
  }
  revalidatePath("/tarefas/email");
}
