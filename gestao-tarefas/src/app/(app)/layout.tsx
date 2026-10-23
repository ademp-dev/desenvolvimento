import { AppShell, type ShellCounts } from "@/components/AppShell";
import { requireUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { isAdmin, visibilityWhere } from "@/lib/permissions";
import { OPEN_STATUSES } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const visible = visibilityWhere(user);

  // Contadores do menu lateral (como os números de não lidas do Gmail).
  const [groups, overdue] = await Promise.all([
    prisma.task.groupBy({ by: ["status"], where: { ...visible, status: { in: OPEN_STATUSES } }, _count: { _all: true } }),
    prisma.task.count({ where: { ...visible, status: { in: OPEN_STATUSES }, dueAt: { lt: new Date() } } }),
  ]);
  const by = Object.fromEntries(groups.map((g) => [g.status, g._count._all])) as Record<string, number>;
  const counts: ShellCounts = {
    CRIADO: by.CRIADO ?? 0,
    ABERTA: by.ABERTA ?? 0,
    EM_ANDAMENTO: by.EM_ANDAMENTO ?? 0,
    open: (by.CRIADO ?? 0) + (by.ABERTA ?? 0) + (by.EM_ANDAMENTO ?? 0),
    overdue,
  };

  return (
    <AppShell user={{ name: user.name, email: user.email, isAdmin: isAdmin(user) }} counts={counts}>
      {children}
    </AppShell>
  );
}
