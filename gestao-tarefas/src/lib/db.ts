import { PrismaClient } from "@prisma/client";

/**
 * Cliente do banco. O nome exibido de cada usuário é o APELIDO, quando o
 * administrador definiu um (tela Usuários); senão, o nome que vem do Google.
 * Como isso vale em toda consulta, o responsável aparece igual no sistema
 * web, na extensão do Chrome, no complemento do Gmail, no PDF e no Excel.
 * O nome completo original é lido com `fullNames()` (tela Usuários).
 */
function createClient() {
  return new PrismaClient().$extends({
    result: {
      user: {
        name: {
          needs: { name: true, nickname: true },
          compute: (u) => u.nickname?.trim() || u.name,
        },
      },
    },
  });
}

type Client = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as { prisma?: Client };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Nome completo (o do Google, sem apelido) de cada usuário: id → nome. */
export async function fullNames(): Promise<Map<string, string>> {
  const rows = await prisma.$queryRaw<{ id: string; name: string }[]>`SELECT "id", "name" FROM "User"`;
  return new Map(rows.map((r) => [r.id, r.name]));
}
