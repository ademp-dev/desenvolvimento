import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { adminEmails, allowedDomain, GMAIL_READONLY_SCOPE, isAllowedAccount } from "@/lib/config";

declare module "next-auth" {
  interface Session {
    user: { id: string; email: string; name?: string | null; image?: string | null };
  }
}

interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  hd?: string;
}

/**
 * Autenticação com Google (OpenID Connect).
 * - Login pede apenas "openid email profile".
 * - O acesso de leitura ao Gmail é pedido depois, só por quem usa o recurso
 *   "Criar tarefa a partir de e-mail" (autorização incremental — ver
 *   src/app/(app)/tarefas/email/actions.ts).
 * - Só contas verificadas do domínio Workspace configurado são aceitas.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Google({
      authorization: {
        params: { scope: "openid email profile", hd: allowedDomain() || undefined, prompt: "select_account" },
      },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const p = profile as unknown as GoogleProfile | undefined;
      if (!p?.email_verified || !isAllowedAccount(p.email, p.hd)) return "/login?error=dominio";
      const existing = await prisma.user.findUnique({ where: { email: p.email.toLowerCase() } });
      if (existing && !existing.active) return "/login?error=inativo";
      return true;
    },

    async jwt({ token, account, profile }) {
      if (account && profile) {
        const p = profile as unknown as GoogleProfile;
        const email = p.email.toLowerCase();
        const shouldBeAdmin = adminEmails().includes(email);
        const user = await prisma.user.upsert({
          where: { email },
          create: {
            email,
            googleSub: p.sub,
            name: p.name || email,
            image: p.picture,
            role: shouldBeAdmin ? "ADMIN" : "USER",
            lastLogin: new Date(),
          },
          update: {
            googleSub: p.sub,
            name: p.name || email,
            image: p.picture,
            lastLogin: new Date(),
            ...(shouldBeAdmin ? { role: "ADMIN" as const } : {}),
          },
        });
        token.uid = user.id;

        // Guarda os tokens apenas quando o usuário concedeu leitura do Gmail.
        if (account.scope?.split(" ").includes(GMAIL_READONLY_SCOPE) && account.access_token) {
          const expiresAt = account.expires_at ? new Date(account.expires_at * 1000) : null;
          const data = {
            accessToken: encrypt(account.access_token),
            expiresAt,
            scope: account.scope,
            ...(account.refresh_token ? { refreshToken: encrypt(account.refresh_token) } : {}),
          };
          await prisma.googleToken.upsert({
            where: { userId: user.id },
            create: { userId: user.id, ...data },
            update: data,
          });
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
  },
});
